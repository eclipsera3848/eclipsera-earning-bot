require("dotenv").config();

const { REST, Routes } = require("discord.js");

const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./withdraw");
const leaderboardCommand = require("./leaderboard");
const approveCommand = require("./approve");
const rejectCommand = require("./reject");

const commands = [
  balanceCommand.data.toJSON(),
  withdrawCommand.data.toJSON(),
  leaderboardCommand.data.toJSON(),
  approveCommand.data.toJSON(),
  rejectCommand.data.toJSON()
];

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

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log("🔄 Registering slash commands...");

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      {
        body: commands
      }
    );

    console.log("=================================");
    console.log("✅ Slash commands registered!");
    console.log("=================================");
    console.log("Commands:");

    commands.forEach((command) => {
      console.log(`✅ /${command.name}`);
    });

  } catch (error) {
    console.error("❌ Failed to register commands:");
    console.error(error);
  }
})();
