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

// =========================
// COMMANDS
// =========================

const balanceCommand = require("./commands/balance");
const withdrawCommand = require("./withdraw");
const leaderboardCommand = require("./leaderboard");
const approveCommand = require("./approve");
const rejectCommand = require("./reject");

// =========================
// DISCORD CLIENT
// =========================

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

// =========================
// COMMAND COLLECTION
// =========================

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

// =========================
// BOT READY
// =========================

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

// =========================
// MESSAGE EARNING SYSTEM
// =========================

client.on("messageCreate", async (message) => {

  // Ignore bots
  if (message.author.bot) {
    return;
  }

  // Ignore DMs
  if (!message.guild) {
    return;
  }

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

// =========================
// ALL INTERACTIONS
// =========================

client.on("interactionCreate", async (interaction) => {

  // =====================================
  // WITHDRAW RESOURCE SELECT MENU
  // =====================================

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId === "withdraw_resource"
  ) {
    try {

      await withdrawCommand.handleInteraction(
        interaction
      );

    } catch (error) {

      console.error(
        "❌ Withdraw resource select error:"
      );

      console.error(error);

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        try {

          await interaction.reply({
            content:
              "❌ Something went wrong while selecting the resource.",
            ephemeral: true
          });

        } catch (replyError) {

          console.error(
            "❌ Could not send select menu error:"
          );

          console.error(replyError);
        }
      }
    }

    return;
  }

  // =====================================
  // WITHDRAW MODAL
  // =====================================

  if (
    interaction.isModalSubmit() &&
    interaction.customId.startsWith(
      "withdraw_modal_"
    )
  ) {
    try {

      await withdrawCommand.handleInteraction(
        interaction
      );

    } catch (error) {

      console.error(
        "❌ Withdraw modal error:"
      );

      console.error(error);

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        try {

          await interaction.reply({
            content:
              "❌ Something went wrong while processing withdrawal.",
            ephemeral: true
          });

        } catch (replyError) {

          console.error(
            "❌ Could not send modal error:"
          );

          console.error(replyError);
        }
      }
    }

    return;
  }

  // =====================================
  // WITHDRAW APPROVE / REJECT BUTTONS
  // =====================================

  if (interaction.isButton()) {

    const customId =
      interaction.customId;

    if (
      customId.startsWith(
        "withdraw_approve_"
      ) ||
      customId.startsWith(
        "withdraw_reject_"
      )
    ) {

      try {

        await withdrawCommand.handleInteraction(
          interaction
        );

      } catch (error) {

        console.error(
          "❌ Withdraw button error:"
        );

        console.error(error);

        if (
          !interaction.replied &&
          !interaction.deferred
        ) {
          try {

            await interaction.reply({
              content:
                "❌ Something went wrong while processing withdrawal.",
              ephemeral: true
            });

          } catch (replyError) {

            console.error(
              "❌ Could not send button error:"
            );

            console.error(replyError);
          }
        }
      }

      return;
    }
  }

  // =====================================
  // SLASH COMMANDS
  // =====================================

  if (
    !interaction.isChatInputCommand()
  ) {
    return;
  }

  const command =
    client.commands.get(
      interaction.commandName
    );

  if (!command) {

    console.error(
      `❌ Command not found: ${interaction.commandName}`
    );

    return;
  }

  try {

    await command.execute(
      interaction
    );

  } catch (error) {

    console.error(
      `❌ Error in /${interaction.commandName}:`
    );

    console.error(error);

    try {

      if (
        interaction.replied ||
        interaction.deferred
      ) {

        await interaction.followUp({
          content:
            "❌ Something went wrong while executing this command.",
          ephemeral: true
        });

      } else {

        await interaction.reply({
          content:
            "❌ Something went wrong while executing this command.",
          ephemeral: true
        });

      }

    } catch (replyError) {

      console.error(
        "❌ Could not send error response:"
      );

      console.error(replyError);
    }
  }
});

// =========================
// LOGIN
// =========================

if (
  !process.env.DISCORD_TOKEN
) {

  console.error(
    "❌ DISCORD_TOKEN is missing!"
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
