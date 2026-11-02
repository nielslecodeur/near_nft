import { startChain } from "./chain.js";
const chain = await startChain();
try {
  console.log("Création du compte…");
  const account = await chain.rootAccount.createSubAccount("smoke", {
    initialBalance: 10n ** 24n,
  });
  console.log("Compte final vérifié :", (await account.accountView()).amount);
} finally {
  await chain.tearDown();
}
