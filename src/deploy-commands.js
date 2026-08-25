require("dotenv").config();

const { REST, Routes } = require("discord.js");

const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./commands/withdraw");
const approveCommand = require("./commands/approve");

const commands = [
  balanceCommand.data.toJSON(),
  withdrawCommand.data.toJSON(),
  approveCommand.data.toJSON()
];

const rest = new REST({ version: "10" }).setToken(
  process.env.DISCORD_TOKEN
);

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

    console.log("✅ Commands registered successfully!");
    console.log("• /balance");
    console.log("• /withdraw");
    console.log("• /approve");
  } catch (error) {
    console.error("❌ Command registration failed:");
    console.error(error);
  }
}

deployCommands();
