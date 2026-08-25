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

const balanceCommand =
  require("./commands/balance");

const withdrawCommand =
  require("./commands/withdraw");

const leaderboardCommand =
  require("./commands/leaderboard");

const approveCommand =
  require("./commands/approve");

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

client.commands =
  new Collection();

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

client.once("ready", async () => {
  console.log(
    "✅ Eclipsera Earning Bot is online!"
  );

  console.log(
    `🤖 Logged in as ${client.user.tag}`
  );

  try {
    await initDatabase();

    console.log(
      "✅ Database connected successfully!"
    );
  } catch (error) {
    console.error(
      "❌ Database connection failed:"
    );

    console.error(error);
  }
});

// Give 1 coin per message
client.on(
  "messageCreate",
  async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    try {
      await addCoin(
        message.author.id
      );

      console.log(
        `💰 +1 coin → ${message.author.tag}`
      );
    } catch (error) {
      console.error(
        "❌ Coin error:",
        error
      );
    }
  }
);

// Slash commands + buttons
client.on(
  "interactionCreate",
  async interaction => {

    // BUTTONS
    if (interaction.isButton()) {

      if (
        interaction.customId.startsWith(
          "withdraw_"
        )
      ) {
        try {
          await approveCommand.handleButton(
            interaction
          );
        } catch (error) {
          console.error(
            "❌ Button error:",
            error
          );
        }
      }

      return;
    }

    // SLASH COMMANDS
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command =
      client.commands.get(
        interaction.commandName
      );

    if (!command) {
      return;
    }

    try {
      await command.execute(
        interaction
      );
    } catch (error) {
      console.error(
        "❌ Command error:",
        error
      );

      try {
        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction.followUp({
            content:
              "❌ Something went wrong.",
            ephemeral: true
          });
        } else {
          await interaction.reply({
            content:
              "❌ Something went wrong.",
            ephemeral: true
          });
        }
      } catch (replyError) {
        console.error(
          "❌ Reply error:",
          replyError
        );
      }
    }
  }
);

client.login(
  process.env.DISCORD_TOKEN
);
