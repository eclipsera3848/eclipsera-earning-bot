require("dotenv").config();

const { REST, Routes } = require("discord.js");

// Commands
const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./withdraw");
const leaderboardCommand = require("./leaderboard");
const approveCommand = require("./approve");
const rejectCommand = require("./reject");

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

const commands = [
  balanceCommand,
  withdrawCommand,
  leaderboardCommand,
  approveCommand,
  rejectCommand
];

const commandData = commands.map((command, index) => {
  if (!command) {
    throw new Error(`❌ Command ${index + 1} is undefined.`);
  }

  if (!command.data) {
    throw new Error(`❌ Command ${index + 1} has no data.`);
  }

  // SlashCommandBuilder
  if (typeof command.data.toJSON === "function") {
    return command.data.toJSON();
  }

  // Plain object
  if (typeof command.data.name === "string") {
  return {
    ...command.data,
    description:
      command.data.description ||
      `Handle ${command.data.name} command`
  };
  }

  throw new Error(
    `❌ Invalid command data at index ${index + 1}. ` +
    `Every command needs name + description.`
  );
});

console.log("=================================");
console.log("📋 Commands to register:");
console.log("=================================");

for (const command of commandData) {
  console.log(`✅ /${command.name} - ${command.description}`);
}

console.log("=================================");

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Registering Discord commands...");

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

  } catch (error) {
    console.error("=================================");
    console.error("❌ COMMAND DEPLOY ERROR");
    console.error("=================================");
    console.error(error);
  }
})();
