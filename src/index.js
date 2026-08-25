require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
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
const approveCommand = require("./approve");
const rejectCommand = require("./reject");

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],

  partials: [
    Partials.Channel
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

client.commands.set(
  approveCommand.data.name,
  approveCommand
);

client.commands.set(
  rejectCommand.data.name,
  rejectCommand
);

// Bot ready
client.once("ready", async () => {
  console.log("=================================");
  console.log("✅ Eclipsera Earning Bot is ONLINE");
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

// Message earning system
client.on("messageCreate", async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Ignore DMs
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

// Slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(
    interaction.commandName
  );

  if (!command) {
    console.error(
      `❌ Command not found: ${interaction.commandName}`
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
          content: "❌ Something went wrong while executing this command.",
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: "❌ Something went wrong while executing this command.",
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error("❌ Could not send error response:");
      console.error(replyError);
    }
  }
});

// Login
if (!process.env.DISCORD_TOKEN) {
  console.error("❌ DISCORD_TOKEN is missing!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
