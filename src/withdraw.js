const {
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require("discord.js");

const { pool } = require("./database/database");

// ======================================================
// RESOURCE CONFIG
// 1000 RESOURCES = PRICE BELOW
// ======================================================

const RESOURCES = {
  iron: {
    name: "Iron",
    emoji: "⛓️",
    maxCoins: 30000
  },

  water: {
    name: "Water",
    emoji: "💧",
    maxCoins: 20000
  },

  stone: {
    name: "Stone",
    emoji: "🪨",
    maxCoins: 10000
  },

  wood: {
    name: "Wood",
    emoji: "🪵",
    maxCoins: 7500
  },

  bread: {
    name: "Bread",
    emoji: "🍞",
    maxCoins: 500
  }
};

const MIN_AMOUNT = 100;
const MAX_AMOUNT = 1000;

// ======================================================
// HELPER
// ======================================================

function calculateCost(resource, amount) {
  const config = RESOURCES[resource];

  if (!config) {
    return null;
  }

  return Math.ceil((config.maxCoins / 1000) * amount);
}

// ======================================================
// COMMAND
// ======================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw your coins as game resources"),

  // ====================================================
  // /withdraw
  // ====================================================

  async execute(interaction) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id SERIAL PRIMARY KEY,
          discord_id VARCHAR(50) NOT NULL,
          resource VARCHAR(20) NOT NULL DEFAULT 'iron',
          amount INTEGER NOT NULL,
          coin_cost BIGINT NOT NULL DEFAULT 0,
          nickname TEXT NOT NULL DEFAULT '',
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add columns if old withdrawals table already exists
      await pool.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS resource VARCHAR(20) NOT NULL DEFAULT 'iron'
      `);

      await pool.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS coin_cost BIGINT NOT NULL DEFAULT 0
      `);

      await pool.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS nickname TEXT NOT NULL DEFAULT ''
      `);

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("withdraw_resource")
        .setPlaceholder("Select the resource you want");

      for (const [key, resource] of Object.entries(RESOURCES)) {
        selectMenu.addOptions(
          new StringSelectMenuOptionBuilder()
            .setLabel(resource.name)
            .setDescription(
              `1000 ${resource.name} = ${resource.maxCoins.toLocaleString()} coins`
            )
            .setValue(key)
            .setEmoji(resource.emoji)
        );
      }

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setTitle("💸 Withdraw Resources")
        .setDescription(
          "Select the resource you want to withdraw.\n\n" +
          "📌 Minimum: **100 resources**\n" +
          "📌 Maximum: **1000 resources**\n\n" +
          "Choose a resource below to continue."
        )
        .setColor(0x5865f2);

      return interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      console.error("Withdraw command error:", error);

      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: "❌ Withdrawal system error.",
          flags: MessageFlags.Ephemeral
        });
      }
    }
  },

  // ====================================================
  // ALL WITHDRAW INTERACTIONS
  // ====================================================

  async handleInteraction(interaction) {
    try {
      // ==================================================
      // RESOURCE SELECT MENU
      // ==================================================

      if (
        interaction.isStringSelectMenu() &&
        interaction.customId === "withdraw_resource"
      ) {
        const resource = interaction.values[0];

        if (!RESOURCES[resource]) {
          return interaction.reply({
            content: "❌ Invalid resource selected.",
            flags: MessageFlags.Ephemeral
          });
        }

        const config = RESOURCES[resource];

        const amountInput = new TextInputBuilder()
          .setCustomId("withdraw_amount")
          .setLabel(`Amount of ${config.name}`)
          .setPlaceholder("Enter amount: 100 - 1000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(4);

        const nicknameInput = new TextInputBuilder()
          .setCustomId("game_nickname")
          .setLabel("In-Game Nickname")
          .setPlaceholder("Enter your in-game nickname")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50);

        const modal = new ModalBuilder()
          .setCustomId(`withdraw_modal_${resource}`)
          .setTitle(`${config.emoji} Withdraw ${config.name}`);

        modal.addComponents(
          new ActionRowBuilder().addComponents(amountInput),
          new ActionRowBuilder().addComponents(nicknameInput)
        );

        return interaction.showModal(modal);
      }

      // ==================================================
      // WITHDRAW MODAL
      // ==================================================

      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith("withdraw_modal_")
      ) {
        const resource = interaction.customId.replace(
          "withdraw_modal_",
          ""
        );

        if (!RESOURCES[resource]) {
          return interaction.reply({
            content: "❌ Invalid resource.",
            flags: MessageFlags.Ephemeral
          });
        }

        const config = RESOURCES[resource];

        // Safely read modal fields
        let amountText = "";
        let nickname = "";

        try {
          amountText = interaction.fields.getTextInputValue(
            "withdraw_amount"
          );

          nickname = interaction.fields.getTextInputValue(
            "game_nickname"
          );
        } catch (fieldError) {
          console.error("Modal field error:", fieldError);

          return interaction.reply({
            content: "❌ Could not read the withdrawal form.",
            flags: MessageFlags.Ephemeral
          });
        }

        amountText = String(amountText || "").trim();
        nickname = String(nickname || "").trim();

        const amount = Number(amountText);

        // -----------------------------------------------
        // AMOUNT VALIDATION
        // -----------------------------------------------

        if (!Number.isInteger(amount)) {
          return interaction.reply({
            content: "❌ Amount must be a whole number.",
            flags: MessageFlags.Ephemeral
          });
        }

        if (amount < MIN_AMOUNT) {
          return interaction.reply({
            content:
              `❌ Minimum withdrawal is **${MIN_AMOUNT} ${config.name}**.`,
            flags: MessageFlags.Ephemeral
          });
        }

        if (amount > MAX_AMOUNT) {
          return interaction.reply({
            content:
              `❌ Maximum withdrawal is **${MAX_AMOUNT} ${config.name}**.`,
            flags: MessageFlags.Ephemeral
          });
        }

        if (!nickname) {
          return interaction.reply({
            content: "❌ Please enter your in-game nickname.",
            flags: MessageFlags.Ephemeral
          });
        }

        // -----------------------------------------------
        // CALCULATE COINS
        // -----------------------------------------------

        const coinCost = calculateCost(resource, amount);

        if (coinCost === null) {
          return interaction.reply({
            content: "❌ Could not calculate withdrawal cost.",
            flags: MessageFlags.Ephemeral
          });
        }

        // -----------------------------------------------
        // CHECK USER ACCOUNT
        // -----------------------------------------------

        const userResult = await pool.query(
          `
          SELECT coins
          FROM users
          WHERE discord_id = $1
          `,
          [interaction.user.id]
        );

        if (userResult.rows.length === 0) {
          return interaction.reply({
            content:
              "❌ You don't have a coin account yet.",
            flags: MessageFlags.Ephemeral
          });
        }

        const balance = Number(userResult.rows[0].coins);

        if (balance < coinCost) {
          return interaction.reply({
            content:
              `❌ Insufficient coins.\n\n` +
              `💰 Required: **${coinCost.toLocaleString()} coins**\n` +
              `💰 Your balance: **${balance.toLocaleString()} coins**`,
            flags: MessageFlags.Ephemeral
          });
        }

        // -----------------------------------------------
        // START TRANSACTION
        // -----------------------------------------------

        await pool.query("BEGIN");

        try {
          // Deduct coins safely
          const updateResult = await pool.query(
            `
            UPDATE users
            SET coins = coins - $1
            WHERE discord_id = $2
              AND coins >= $1
            RETURNING coins
            `,
            [coinCost, interaction.user.id]
          );

          if (updateResult.rows.length === 0) {
            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                "❌ Your coin balance changed. Please try again.",
              flags: MessageFlags.Ephemeral
            });
          }

          // Create withdrawal request
          const withdrawalResult = await pool.query(
            `
            INSERT INTO withdrawals
              (
                discord_id,
                resource,
                amount,
                coin_cost,
                nickname,
                status
              )
            VALUES
              ($1, $2, $3, $4, $5, 'pending')
            RETURNING id
            `,
            [
              interaction.user.id,
              resource,
              amount,
              coinCost,
              nickname
            ]
          );

          await pool.query("COMMIT");

          const withdrawalId =
            withdrawalResult.rows[0].id;

          // ---------------------------------------------
          // ADMIN EMBED
          // ---------------------------------------------

          const embed = new EmbedBuilder()
            .setTitle("💸 New Withdrawal Request")
            .setColor(0xfee75c)
            .addFields(
              {
                name: "👤 Player",
                value: `<@${interaction.user.id}>`,
                inline: true
              },
              {
                name: "🎁 Resource",
                value:
                  `${config.emoji} ${config.name}`,
                inline: true
              },
              {
                name: "📦 Amount",
                value:
                  `${amount.toLocaleString()} ${config.name}`,
                inline: true
              },
              {
                name: "💰 Coins",
                value:
                  `${coinCost.toLocaleString()} coins`,
                inline: true
              },
              {
                name: "🎮 In-Game Nickname",
                value: nickname,
                inline: false
              },
              {
                name: "🆔 Withdrawal ID",
                value: `#${withdrawalId}`,
                inline: true
              },
              {
                name: "📌 Status",
                value: "⏳ Pending",
                inline: true
              }
            )
            .setTimestamp();

          const approveButton = new ButtonBuilder()
            .setCustomId(
              `withdraw_approve_${withdrawalId}`
            )
            .setLabel("Approve")
            .setEmoji("✅")
            .setStyle(ButtonStyle.Success);

          const rejectButton = new ButtonBuilder()
            .setCustomId(
              `withdraw_reject_${withdrawalId}`
            )
            .setLabel("Reject")
            .setEmoji("❌")
            .setStyle(ButtonStyle.Danger);

          const buttons = new ActionRowBuilder()
            .addComponents(
              approveButton,
              rejectButton
            );

          // ---------------------------------------------
          // SEND TO ADMIN
          // ---------------------------------------------

          const adminId = process.env.ADMIN_ID;

          if (adminId) {
            try {
              const adminUser =
                await interaction.client.users.fetch(adminId);

              await adminUser.send({
                embeds: [embed],
                components: [buttons]
              });
            } catch (adminError) {
              console.error(
                "Could not send withdrawal to admin:",
                adminError
              );
            }
          }

          // ---------------------------------------------
          // PLAYER RESPONSE
          // ---------------------------------------------

          return interaction.reply({
            content:
              `✅ **Withdrawal request submitted!**\n\n` +
              `${config.emoji} Resource: **${config.name}**\n` +
              `📦 Amount: **${amount.toLocaleString()}**\n` +
              `💰 Cost: **${coinCost.toLocaleString()} coins**\n` +
              `🎮 Nickname: **${nickname}**\n` +
              `🆔 Request ID: **#${withdrawalId}**\n\n` +
              `⏳ Waiting for admin approval.`,
            flags: MessageFlags.Ephemeral
          });
        } catch (transactionError) {
          await pool.query("ROLLBACK");
          throw transactionError;
        }
      }

      // ==================================================
      // APPROVE BUTTON
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "withdraw_approve_"
        )
      ) {
        const adminId = process.env.ADMIN_ID;

        if (
          adminId &&
          interaction.user.id !== adminId
        ) {
          return interaction.reply({
            content:
              "❌ You are not allowed to approve withdrawals.",
            flags: MessageFlags.Ephemeral
          });
        }

        const withdrawalId =
          interaction.customId.replace(
            "withdraw_approve_",
            ""
          );

        const result = await pool.query(
          `
          SELECT *
          FROM withdrawals
          WHERE id = $1
          `,
          [withdrawalId]
        );

        if (result.rows.length === 0) {
          return interaction.reply({
            content:
              "❌ Withdrawal request not found.",
            flags: MessageFlags.Ephemeral
          });
        }

        const withdrawal = result.rows[0];

        if (withdrawal.status !== "pending") {
          return interaction.reply({
            content:
              `❌ This withdrawal is already **${withdrawal.status}**.`,
            flags: MessageFlags.Ephemeral
          });
        }

        await pool.query(
          `
          UPDATE withdrawals
          SET status = 'approved'
          WHERE id = $1
          `,
          [withdrawalId]
        );

        const resource =
          RESOURCES[withdrawal.resource] ||
          RESOURCES.iron;

        const approvedEmbed = new EmbedBuilder()
          .setTitle("✅ Withdrawal Approved")
          .setColor(0x57f287)
          .addFields(
            {
              name: "👤 Player",
              value: `<@${withdrawal.discord_id}>`,
              inline: true
            },
            {
              name: "🎁 Resource",
              value:
                `${resource.emoji} ${resource.name}`,
              inline: true
            },
            {
              name: "📦 Amount",
              value:
                `${Number(
                  withdrawal.amount
                ).toLocaleString()} ${resource.name}`,
              inline: true
            },
            {
              name: "💰 Coins",
              value:
                `${Number(
                  withdrawal.coin_cost
                ).toLocaleString()} coins`,
              inline: true
            },
            {
              name: "🎮 In-Game Nickname",
              value: withdrawal.nickname,
              inline: false
            },
            {
              name: "🆔 Request ID",
              value: `#${withdrawal.id}`,
              inline: true
            },
            {
              name: "📌 Status",
              value: "✅ Approved",
              inline: true
            }
          )
          .setTimestamp();

        await interaction.update({
          embeds: [approvedEmbed],
          components: []
        });

        // DM PLAYER
        try {
          const player =
            await interaction.client.users.fetch(
              withdrawal.discord_id
            );

          await player.send(
            `✅ **Your withdrawal has been approved!**\n\n` +
            `${resource.emoji} Resource: **${resource.name}**\n` +
            `📦 Amount: **${Number(
              withdrawal.amount
            ).toLocaleString()}**\n` +
            `🎮 Nickname: **${withdrawal.nickname}**\n` +
            `🆔 Request ID: **#${withdrawal.id}**`
          );
        } catch (dmError) {
          console.error(
            "Could not DM player:",
            dmError
          );
        }

        return;
      }

      // ==================================================
      // REJECT BUTTON
      // ==================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith(
          "withdraw_reject_"
        )
      ) {
        const adminId = process.env.ADMIN_ID;

        if (
          adminId &&
          interaction.user.id !== adminId
        ) {
          return interaction.reply({
            content:
              "❌ You are not allowed to reject withdrawals.",
            flags: MessageFlags.Ephemeral
          });
        }

        const withdrawalId =
          interaction.customId.replace(
            "withdraw_reject_",
            ""
          );

        await pool.query("BEGIN");

        try {
          const result = await pool.query(
            `
            SELECT *
            FROM withdrawals
            WHERE id = $1
            FOR UPDATE
            `,
            [withdrawalId]
          );

          if (result.rows.length === 0) {
            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                "❌ Withdrawal request not found.",
              flags: MessageFlags.Ephemeral
            });
          }

          const withdrawal = result.rows[0];

          if (withdrawal.status !== "pending") {
            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                `❌ This withdrawal is already **${withdrawal.status}**.`,
              flags: MessageFlags.Ephemeral
            });
          }

          // REFUND COINS
          await pool.query(
         UPDATE users
            SET coins = coins + $1
            WHERE discord_id = $2
            `,
            [
              Number(withdrawal.coin_cost),
              withdrawal.discord_id
            ]
          );

          // UPDATE STATUS
          await pool.query(
            `
            UPDATE withdrawals
            SET status = 'rejected'
            WHERE id = $1
            `,
            [withdrawalId]
          );

          await pool.query("COMMIT");

          const resource =
            RESOURCES[withdrawal.resource] ||
            RESOURCES.iron;

          const rejectedEmbed = new EmbedBuilder()
            .setTitle("❌ Withdrawal Rejected")
            .setColor(0xed4245)
            .addFields(
              {
                name: "👤 Player",
                value: `<@${withdrawal.discord_id}>`,
                inline: true
              },
              {
                name: "🎁 Resource",
                value:
                  `${resource.emoji} ${resource.name}`,
                inline: true
              },
              {
                name: "📦 Amount",
                value:
                  `${Number(
                    withdrawal.amount
                  ).toLocaleString()} ${resource.name}`,
                inline: true
              },
              {
                name: "💰 Refunded",
                value:
                  `${Number(
                    withdrawal.coin_cost
                  ).toLocaleString()} coins`,
                inline: true
              },
              {
                name: "🎮 In-Game Nickname",
                value: withdrawal.nickname,
                inline: false
              },
              {
                name: "🆔 Request ID",
                value: `#${withdrawal.id}`,
                inline: true
              },
              {
                name: "📌 Status",
                value:
                  "❌ Rejected — Coins Refunded",
                inline: false
              }
            )
            .setTimestamp();

          await interaction.update({
            embeds: [rejectedEmbed],
            components: []
          });

          // DM PLAYER
          try {
            const player =
              await interaction.client.users.fetch(
                withdrawal.discord_id
              );

            await player.send(
              `❌ **Your withdrawal was rejected.**\n\n` +
              `🎁 Resource: **${resource.name}**\n` +
              `📦 Amount: **${Number(
                withdrawal.amount
              ).toLocaleString()}**\n` +
              `💰 Refunded: **${Number(
                withdrawal.coin_cost
              ).toLocaleString()} coins**\n` +
              `🎮 Nickname: **${withdrawal.nickname}**\n` +
              `🆔 Request ID: **#${withdrawal.id}**`
            );
          } catch (dmError) {
            console.error(
              "Could not DM player:",
              dmError
            );
          }

          return;
        } catch (rejectError) {
          await pool.query("ROLLBACK");
          throw rejectError;
        }
      }
    } catch (error) {
      console.error(
        "Withdrawal interaction error:",
        error
      );

      if (
        !interaction.replied &&
        !interaction.deferred
      ) {
        return interaction.reply({
          content:
            "❌ Something went wrong while processing the withdrawal.",
          flags: MessageFlags.Ephemeral
        });
      }
    }
  }
};
