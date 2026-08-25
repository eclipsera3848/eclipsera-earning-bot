const fs = require("fs");
const path = require("path");
const { REST, Routes } = require("discord.js");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  console.error("❌ Missing DISCORD_TOKEN, CLIENT_ID or GUILD_ID");
  process.exit(1);
}

const commands = [];
const srcPath = __dirname;

// Load command files from src/commands
const commandsFolder = path.join(srcPath, "commands");

if (fs.existsSync(commandsFolder)) {
  const files = fs
    .readdirSync(commandsFolder)
    .filter(file => file.endsWith(".js"));

  for (const file of files) {
    try {
      const command = require(path.join(commandsFolder, file));

      if (command?.data?.toJSON) {
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded: ${command.data.name}`);
      }
    } catch (error) {
      console.error(`❌ Error loading ${file}:`, error.message);
    }
  }
}

// Load command files directly inside src
const rootFiles = [
  "withdraw.js",
  "approve.js",
  "reject.js",
  "leaderboard.js"
];

for (const file of rootFiles) {
  const filePath = path.join(srcPath, file);

  if (fs.existsSync(filePath)) {
    try {
      const command = require(filePath);

      if (command?.data?.toJSON) {
        commands.push(command.data.toJSON());
        console.log(`✅ Loaded: ${command.data.name}`);
      }
    } catch (error) {
      console.error(`❌ Error loading ${file}:`, error.message);
    }
  }
}

async function deployCommands() {
  try {
    console.log(`📦 Registering ${commands.length} commands...`);

    const rest = new REST({ version: "10" }).setToken(token);

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log("✅ All slash commands registered successfully!");
  } catch (error) {
    console.error("❌ Failed to register commands:");
    console.error(error);
  }
}

deployCommands();
