require("dotenv").config();

const { REST, Routes } = require("discord.js");

const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./commands/withdraw");
const leaderboardCommand = require("./commands/leaderboard");

const commands = [
  balanceCommand.data.toJSON(),
  withdrawCommand.data.toJSON(),
  leaderboardCommand.data.toJSON()
];

const rest = new REST({ version: "10" })
  .setToken(process.env.DISCORD_TOKEN);

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

    console.log("✅ Slash commands registered successfully!");
    console.log("📋 Commands:");
    console.log("• /balance");
    console.log("• /withdraw");
    console.log("• /leaderboard");
  } catch (error) {
    console.error("❌ Failed to register commands:");
    console.error(error);
  }
}

deployCommands();
