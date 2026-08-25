require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Collection
} = require("discord.js");

const {
  initDatabase,
  addCoin
} = require("./database/database");

// Commands
const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./withdraw");
const leaderboardCommand = require("./leaderboard");

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Command collection
client.commands = new Collection();

// Register commands
client.commands.set(
  balanceCommand.data.name,
  balanceCommand
);

client.commands.set(
  withdrawCommand.data.name,
  withdrawCommand
);

client.commands.set(
  leaderboardCommand.data.name,
  leaderboardCommand
);

// Bot ready
client.once("ready", async () => {
  console.log("=================================");
  console.log("✅ Eclipsera Earning Bot is online!");
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log("=================================");

  try {
    await initDatabase();
    console.log("✅ Database connected successfully!");
  } catch (error) {
    console.error("❌ Database connection failed:");
    console.error(error);
  }
});

// Give 1 coin for every normal message
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  try {
    await addCoin(message.author.id);

    console.log(
      `💰 +1 coin → ${message.author.tag}`
    );
  } catch (error) {
    console.error("❌ Coin error:");
    console.error(error);
  }
});

// Handle slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(
    interaction.commandName
  );

  if (!command) {
    console.log(
      `⚠️ Unknown command: ${interaction.commandName}`
    );
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(
      `❌ Error in /${interaction.commandName}:`
    );
    console.error(error);

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "❌ Something went wrong.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: "❌ Something went wrong.",
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error("❌ Could not send error reply:");
      console.error(replyError);
    }
  }
});

// Check Discord token
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing from Railway Variables!");
  process.exit(1);
}

// Login
client.login(process.env.DISCORD_TOKEN);
