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

const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./withdraw");
const leaderboardCommand = require("./leaderboard");
const approveCommand = require("./approve");
const rejectCommand = require("./reject");

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

// Commands collection
client.commands = new Collection();

// Balance
client.commands.set(
  balanceCommand.data.name,
  balanceCommand
);

// Withdraw
client.commands.set(
  withdrawCommand.data.name,
  withdrawCommand
);

// Leaderboard
client.commands.set(
  leaderboardCommand.data.name,
  leaderboardCommand
);

// Approve
client.commands.set(
  approveCommand.data.name,
  approveCommand
);

// Reject
client.commands.set(
  rejectCommand.data.name,
  rejectCommand
);

console.log(
  "📋 Loaded commands:",
  [...client.commands.keys()].join(", ")
);

// Bot ready
client.once("ready", async () => {
  console.log("✅ Eclipsera Earning Bot is online!");
  console.log(`🤖 Logged in as ${client.user.tag}`);

  try {
    await initDatabase();
    console.log("✅ Database connected successfully!");
  } catch (error) {
    console.error("❌ Database connection failed:");
    console.error(error);
  }
});

// Message → +1 Coin
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

// Slash commands
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(
    interaction.commandName
  );

  if (!command) {
    console.error(
      `❌ Command not loaded: ${interaction.commandName}`
    );

    return interaction.reply({
      content: "❌ This command is not loaded by the bot.",
      ephemeral: true
    });
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
      console.error(
        "❌ Could not send Discord error reply:",
        replyError
      );
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
