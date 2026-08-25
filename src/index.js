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

client.commands = new Collection();

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

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(
    interaction.commandName
  );

  if (!command) return;

  try {
    await command.execute(interaction);

  } catch (error) {
    console.error("❌ Command error:");
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
      console.error("❌ Could not reply:", replyError);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
