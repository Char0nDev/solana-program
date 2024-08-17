import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
  TransactionInstruction,
  sendAndConfirmTransaction,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import path from "path";
import { Schema, serialize } from "borsh";
import fs from "fs";
import os from "os";
import yaml from "yaml";

const connection = new Connection(
  "https://devnet.helius-rpc.com/?api-key=f9b2cb1b-8aac-4705-aa94-39fd02473cdd",
  "confirmed"
);

const PROGRAM_KEYPAIR_PATH = path.join(
  __dirname,
  "..",
  "..",
  "/dist/program",
  "helloworld-keypair.json"
);

const secretKeyString = fs.readFileSync(PROGRAM_KEYPAIR_PATH, {
  encoding: "utf-8",
});
const secretKey = new Uint8Array(JSON.parse(secretKeyString));
const programKeypair = Keypair.fromSecretKey(secretKey);

let programId: PublicKey;
let greetedPubkey: PublicKey;
let payer: Keypair;

class GreetingAccount {
  counter = 0;
  constructor(fields: { counter: number } | undefined = undefined) {
    if (fields) {
      this.counter = fields.counter;
    }
  }
}

const GreetingSchema: Schema = {
  struct: {
    counter: "u32",
  },
};

const GREETING_SIZE = serialize(GreetingSchema, new GreetingAccount()).length;

async function main() {
  await checkProgram();

  console.log("Saying hello to", greetedPubkey.toBase58());
  const instruction = new TransactionInstruction({
    keys: [{ pubkey: greetedPubkey, isSigner: false, isWritable: true }],
    programId,
    data: Buffer.alloc(0), 
  });
  await sendAndConfirmTransaction(
    connection,
    new Transaction().add(instruction),
    [payer]
  );
}

async function checkProgram() {
  await getPayer();
  // Read program id from keypair file
  try {
    programId = programKeypair.publicKey;
  } catch (err) {
    const errMsg = (err as Error).message;
    throw new Error(
      `Failed to read program keypair at '${PROGRAM_KEYPAIR_PATH}' due to error: ${errMsg}. Program may need to be deployed with \`solana program deploy dist/program/helloworld.so\``
    );
  }

  const programInfo = await connection.getAccountInfo(programId);
  if (programInfo === null) {
    if (fs.existsSync(PROGRAM_KEYPAIR_PATH)) {
      throw new Error(
        "Program needs to be deployed with `solana program deploy dist/program/helloworld.so`"
      );
    } else {
      throw new Error("Program needs to be built and deployed");
    }
  } else if (!programInfo.executable) {
    throw new Error(`Program is not executable`);
  }

  console.log(`--- Using program ${programId.toBase58()}`);

  const GREETING_SEED = "hello";
  greetedPubkey = await PublicKey.createWithSeed(
    payer.publicKey,
    GREETING_SEED,
    programId
  );

  const greetedAccount = await connection.getAccountInfo(greetedPubkey);
  if (greetedAccount === null) {
    console.log(
      "Creating account",
      greetedPubkey.toBase58(),
      "to say hello to"
    );
    const lamports = await connection.getMinimumBalanceForRentExemption(
      GREETING_SIZE
    );

    const transaction = new Transaction().add(
      SystemProgram.createAccountWithSeed({
        fromPubkey: payer.publicKey,
        basePubkey: payer.publicKey,
        seed: GREETING_SEED,
        newAccountPubkey: greetedPubkey,
        lamports,
        space: GREETING_SIZE,
        programId,
      })
    );
    await sendAndConfirmTransaction(connection, transaction, [payer]);
  }
}

async function getPayer() {
  interface solanaConfig {
    json_rpc_url: string;
    websocket_url: string;
    keypair_path: string;
    address_labels: any;
    commitment: string;
  }
  const CONFIG_FILE_PATH = path.resolve(
    os.homedir(),
    ".config",
    "solana",
    "cli",
    "config.yml"
  );
  const configYml = fs.readFileSync(CONFIG_FILE_PATH, { encoding: "utf-8" });
  const config: solanaConfig = yaml.parse(configYml);
  let payerKeypairPath = config.keypair_path;

  const payerSecretKeyString = fs.readFileSync(payerKeypairPath, {
    encoding: "utf-8",
  });
  const payerSecretKey = new Uint8Array(JSON.parse(payerSecretKeyString));
  payer = Keypair.fromSecretKey(payerSecretKey);
}

main();
