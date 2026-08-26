require("dotenv").config();

const {
  REST,
  Routes
} = require("discord.js");

// Player commands
const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./withdraw");
const leaderboardCommand = require("./leaderboard");

// Admin commands
const approveCommand = require("./approve");
const rejectCommand = require("./reject");

const commands = [
  balanceCommand.data.toJSON(),
  withdrawCommand.data.toJSON(),
  leaderboardCommand.data.toJSON(),
  approveCommand.data.toJSON(),
  rejectCommand.data.toJSON()
];

const rest = new REST({
  version: "10"
}).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
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

    console.log("✅ All slash commands registered!");
    console.log("📋 Commands:");
    console.log("• /balance");
    console.log("• /withdraw");
    console.log("• /leaderboard");
    console.log("• /approve");
    console.log("• /reject");

  } catch (error) {
    console.error("❌ Failed to register commands:");
    console.error(error);
  }
}

deployCommands();
