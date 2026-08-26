require("dotenv").config();

const { REST, Routes } = require("discord.js");

// =========================
// COMMANDS
// =========================

const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./withdraw");
const leaderboardCommand = require("./leaderboard");
const approveCommand = require("./approve");
const rejectCommand = require("./reject");

// =========================
// CHECK ENV
// =========================

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

if (!process.env.CLIENT_ID) {
  console.error("❌ CLIENT_ID is missing!");
  process.exit(1);
}

if (!process.env.GUILD_ID) {
  console.error("❌ GUILD_ID is missing!");
  process.exit(1);
}

// =========================
// ALL COMMANDS
// =========================

const commands = [
  balanceCommand,
  withdrawCommand,
  leaderboardCommand,
  approveCommand,
  rejectCommand
];

// =========================
// CONVERT COMMAND DATA
// =========================

const commandData = commands.map((command) => {
  if (!command || !command.data) {
    throw new Error("❌ A command is missing its data property.");
  }

  // SlashCommandBuilder
  if (typeof command.data.toJSON === "function") {
    return command.data.toJSON();
  }

  // Already plain JSON object
  return command.data;
});

// =========================
// DEPLOY
// =========================

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("=================================");
    console.log("🔄 Registering Discord commands...");
    console.log("=================================");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commandData
      }
    );

    console.log("=================================");
    console.log("✅ ALL COMMANDS REGISTERED!");
    console.log("=================================");

    commandData.forEach((command) => {
      console.log(`✅ /${command.name}`);
    });

  } catch (error) {
    console.error("=================================");
    console.error("❌ COMMAND DEPLOY ERROR");
    console.error("=================================");
    console.error(error);
  }
})();
