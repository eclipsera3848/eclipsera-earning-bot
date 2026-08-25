require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const {
  initDatabase,
  addCoin,
  pool
} = require("./database/database");

const balanceCommand = require("./commands/balance");
const leaderboardCommand = require("./commands/leaderboard");
const withdrawCommand = require("./commands/withdraw");

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

// ===============================
// COMMANDS
// ===============================

client.commands = new Collection();

client.commands.set(
  balanceCommand.data.name,
  balanceCommand
);

client.commands.set(
  leaderboardCommand.data.name,
  leaderboardCommand
);

client.commands.set(
  withdrawCommand.data.name,
  withdrawCommand
);

// ===============================
// BOT READY
// ===============================

client.once("ready", async () => {
  console.log("=================================");
  console.log("✅ Eclipsera Earning Bot is ONLINE");
  console.log(`🤖 Logged in as: ${client.user.tag}`);
  console.log("=================================");

  try {
    await initDatabase();

    console.log("✅ Database initialized successfully.");
  } catch (error) {
    console.error("❌ Database initialization failed:");
    console.error(error);
  }
});

// ===============================
// MESSAGE → +1 COIN
// ===============================

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

// ===============================
// INTERACTIONS
// ===============================

client.on("interactionCreate", async (interaction) => {
  try {

    // =================================
    // SLASH COMMANDS
    // =================================

    if (interaction.isChatInputCommand()) {

      const command = client.commands.get(
        interaction.commandName
      );

      if (!command) {
        return;
      }

      await command.execute(interaction);

      return;
    }

    // =================================
    // WITHDRAW MODAL
    // =================================

    if (
      interaction.isModalSubmit() &&
      interaction.customId.startsWith("withdraw_modal_")
    ) {

      const command = client.commands.get("withdraw");

      if (!command) {
        return interaction.reply({
          content: "❌ Withdraw command is not loaded.",
          ephemeral: true
        });
      }

      await command.handleModal(interaction);

      return;
    }

    // =================================
    // WITHDRAW BUTTONS
    // =================================

    if (
      interaction.isButton() &&
      (
        interaction.customId.startsWith("withdraw_approve_") ||
        interaction.customId.startsWith("withdraw_reject_")
      )
    ) {

      // ---------------------------------
      // ADMIN CHECK
      // ---------------------------------

      if (
        !interaction.member.permissions.has(
          PermissionFlagsBits.Administrator
        )
      ) {
        return interaction.reply({
          content:
            "❌ Only administrators can approve or reject withdrawals.",
          ephemeral: true
        });
      }

      const parts = interaction.customId.split("_");

      const action = parts[1];

      const requestId = Number(parts[2]);

      if (!requestId) {
        return interaction.reply({
          content: "❌ Invalid request ID.",
          ephemeral: true
        });
      }

      // =================================
      // APPROVE
      // =================================

      if (action === "approve") {

        const dbClient = await pool.connect();

        try {

          await dbClient.query("BEGIN");

          const requestResult = await dbClient.query(
            `
            SELECT
              id,
              discord_id,
              amount,
              status
            FROM requests
            WHERE id = $1
            FOR UPDATE
            `,
            [requestId]
          );

          if (requestResult.rows.length === 0) {

            await dbClient.query("ROLLBACK");

            return interaction.reply({
              content: "❌ Withdrawal request not found.",
              ephemeral: true
            });
          }

          const request = requestResult.rows[0];

          if (request.status !== "PENDING") {

            await dbClient.query("ROLLBACK");

            return interaction.reply({
              content:
                `❌ This request is already **${request.status}**.`,
              ephemeral: true
            });
          }

          // Update request
          await dbClient.query(
            `
            UPDATE requests
            SET
              status = 'APPROVED',
              approved_at = CURRENT_TIMESTAMP,
              approved_by = $1
            WHERE id = $2
            `,
            [
              interaction.user.id,
              requestId
            ]
          );

          // Remove reserved coins
          await dbClient.query(
            `
            UPDATE users
            SET reserved_coins =
              GREATEST(reserved_coins - $1, 0),
                total_spent =
              total_spent + $1
            WHERE discord_id = $2
            `,
            [
              request.amount,
              request.discord_id
            ]
          );

          // Transaction
          await dbClient.query(
            `
            INSERT INTO transactions
              (
                discord_id,
                type,
                amount,
                reason,
                request_id
              )
            VALUES
              (
                $1,
                'WITHDRAW_APPROVED',
                $2,
                'Withdrawal approved',
                $3
              )
            `,
            [
              request.discord_id,
              request.amount,
              requestId
            ]
          );

          await dbClient.query("COMMIT");

          // Update Discord message
          const oldEmbed =
            interaction.message.embeds[0];

          const approvedEmbed =
            EmbedBuilder.from(oldEmbed)
              .setColor(0x57F287)
              .spliceFields(
                4,
                1,
                {
                  name: "📌 Status",
                  value:
                    `✅ APPROVED by ${interaction.user}`,
                  inline: true
                }
              );

          await interaction.update({
            embeds: [approvedEmbed],
            components: []
          });

          console.log(
            `✅ Withdrawal #${requestId} approved by ${interaction.user.tag}`
          );

        } catch (error) {

          try {
            await dbClient.query("ROLLBACK");
          } catch {}

          console.error(
            "❌ Approve withdrawal error:",
            error
          );

          if (!interaction.replied) {
            await interaction.reply({
              content:
                "❌ Could not approve this withdrawal.",
              ephemeral: true
            });
          }

        } finally {

          dbClient.release();
        }

        return;
      }

      // =================================
      // REJECT
      // =================================

      if (action === "reject") {

        const dbClient = await pool.connect();

        try {

          await dbClient.query("BEGIN");

          const requestResult = await dbClient.query(
            `
            SELECT
              id,
              discord_id,
              amount,
              status
            FROM requests
            WHERE id = $1
            FOR UPDATE
            `,
            [requestId]
          );

          if (requestResult.rows.length === 0) {

            await dbClient.query("ROLLBACK");

            return interaction.reply({
              content:
                "❌ Withdrawal request not found.",
              ephemeral: true
            });
          }

          const request = requestResult.rows[0];

          if (request.status !== "PENDING") {

            await dbClient.query("ROLLBACK");

            return interaction.reply({
              content:
                `❌ This request is already **${request.status}**.`,
              ephemeral: true
            });
          }

          // Mark rejected
          await dbClient.query(
            `
            UPDATE requests
            SET
              status = 'REJECTED',
              approved_by = $1
            WHERE id = $2
            `,
            [
              interaction.user.id,
              requestId
            ]
          );

          // Return reserved coins
          await dbClient.query(
            `
            UPDATE users
            SET
              coins = coins + $1,
              reserved_coins =
                GREATEST(reserved_coins - $1, 0)
            WHERE discord_id = $2
            `,
            [
              request.amount,
              request.discord_id
            ]
          );

          // Transaction
          await dbClient.query(
            `
            INSERT INTO transactions
              (
                discord_id,
                type,
                amount,
                reason,
                request_id
              )
            VALUES
              (
                $1,
                'WITHDRAW_REJECTED',
                $2,
                'Withdrawal rejected - coins returned',
                $3
              )
            `,
            [
              request.discord_id,
              request.amount,
              requestId
            ]
          );

          await dbClient.query("COMMIT");

          // Update Discord message
          const oldEmbed =
            interaction.message.embeds[0];

          const rejectedEmbed =
            EmbedBuilder.from(oldEmbed)
              .setColor(0xED4245)
              .spliceFields(
                4,
                1,
                {
                  name: "📌 Status",
                  value:
                    `❌ REJECTED by ${interaction.user}`,
                  inline: true
                }
              );

          await interaction.update({
            embeds: [rejectedEmbed],
            components: []
          });

          console.log(
            `❌ Withdrawal #${requestId} rejected by ${interaction.user.tag}`
          );

        } catch (error) {

          try {
            await dbClient.query("ROLLBACK");
          } catch {}

          console.error(
            "❌ Reject withdrawal error:",
            error
          );

          if (!interaction.replied) {
            await interaction.reply({
              content:
                "❌ Could not reject this withdrawal.",
              ephemeral: true
            });
          }

        } finally {

          dbClient.release();
        }

        return;
      }
    }

  } catch (error) {

    console.error("❌ Interaction error:");
    console.error(error);

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
        "❌ Could not send error reply:",
        replyError
      );
    }
  }
});

// ===============================
// LOGIN
// ===============================

client.login(
  process.env.DISCORD_TOKEN
);
