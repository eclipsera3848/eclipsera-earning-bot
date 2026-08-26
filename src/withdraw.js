const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder
} = require("discord.js");

const { pool } = require("./database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Withdraw your earned items")

    // ITEM OPTION
    .addStringOption(option =>
      option
        .setName("item")
        .setDescription("Select what you want to withdraw")
        .setRequired(true)
        .addChoices(
          {
            name: "⛓️ Iron",
            value: "iron"
          },
          {
            name: "💧 Water",
            value: "water"
          },
          {
            name: "🪵 Wood",
            value: "wood"
          },
          {
            name: "🪨 Stone",
            value: "stone"
          },
          {
            name: "🍞 Bread",
            value: "bread"
          }
        )
    )

    // AMOUNT OPTION
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("How many coins do you want to withdraw?")
        .setRequired(true)
        .setMinValue(1)
    )

    // NICKNAME OPTION
    .addStringOption(option =>
      option
        .setName("nickname")
        .setDescription("Your in-game nickname")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // Create table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id SERIAL PRIMARY KEY,
          discord_id VARCHAR(50) NOT NULL,
          item_type VARCHAR(30) NOT NULL,
          amount BIGINT NOT NULL,
          nickname TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // If old withdrawals table already exists,
      // make sure item_type column exists
      await pool.query(`
        ALTER TABLE withdrawals
        ADD COLUMN IF NOT EXISTS item_type VARCHAR(30)
      `);

      const item = interaction.options.getString("item");
      const amount = interaction.options.getInteger("amount");
      const nickname = interaction.options
        .getString("nickname")
        .trim();

      if (!nickname) {
        return interaction.reply({
          content: "❌ Please enter your in-game nickname.",
          ephemeral: true
        });
      }

      // Get user's coin balance
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
          content: "❌ You don't have a coin account yet.",
          ephemeral: true
        });
      }

      const balance = Number(userResult.rows[0].coins);

      if (amount > balance) {
        return interaction.reply({
          content:
            `❌ Insufficient balance.\n\n` +
            `💰 Your balance: **${balance.toLocaleString()} coins**\n` +
            `💸 Requested: **${amount.toLocaleString()} coins**`,
          ephemeral: true
        });
      }

      // Item display names
      const itemNames = {
        iron: "⛓️ Iron",
        water: "💧 Water",
        wood: "🪵 Wood",
        stone: "🪨 Stone",
        bread: "🍞 Bread"
      };

      const itemName = itemNames[item];

      // Use ONE database connection for transaction
      const client = await pool.connect();

      let withdrawalId;

      try {
        await client.query("BEGIN");

        // Remove coins from user
        const updateResult = await client.query(
          `
          UPDATE users
          SET coins = coins - $1
          WHERE discord_id = $2
            AND coins >= $1
          RETURNING coins
          `,
          [amount, interaction.user.id]
        );

        if (updateResult.rows.length === 0) {
          await client.query("ROLLBACK");
          client.release();

          return interaction.reply({
            content: "❌ Your balance changed. Please try again.",
            ephemeral: true
          });
        }

        // Create withdrawal request
        const withdrawalResult = await client.query(
          `
          INSERT INTO withdrawals
            (discord_id, item_type, amount, nickname, status)
          VALUES
            ($1, $2, $3, $4, 'pending')
          RETURNING id
          `,
          [
            interaction.user.id,
            item,
            amount,
            nickname
          ]
        );

        withdrawalId = withdrawalResult.rows[0].id;

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      // =========================
      // ADMIN EMBED
      // =========================

      const embed = new EmbedBuilder()
        .setTitle("💸 New Withdrawal Request")
        .setColor(0xF1C40F)
        .addFields(
          {
            name: "👤 Player",
            value: `<@${interaction.user.id}>`,
            inline: true
          },
          {
            name: "📦 Item",
            value: itemName,
            inline: true
          },
          {
            name: "💰 Amount",
            value: `${amount.toLocaleString()} coins`,
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

      // =========================
      // APPROVE BUTTON
      // =========================

      const approveButton = new ButtonBuilder()
        .setCustomId(`withdraw_approve_${withdrawalId}`)
        .setLabel("Approve")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

      // =========================
      // REJECT BUTTON
      // =========================

      const rejectButton = new ButtonBuilder()
        .setCustomId(`withdraw_reject_${withdrawalId}`)
        .setLabel("Reject")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Danger);

      const buttons = new ActionRowBuilder()
        .addComponents(
          approveButton,
          rejectButton
        );

      // =========================
      // SEND TO ADMIN
      // =========================

      const adminId = process.env.ADMIN_ID;

      if (adminId) {
        try {
          const adminUser =
            await interaction.client.users.fetch(adminId);

          await adminUser.send({
            embeds: [embed],
            components: [buttons]
          });
        } catch (error) {
          console.error(
            "Could not send withdrawal request to admin:",
            error
          );
        }
      }

      // =========================
      // PLAYER RESPONSE
      // =========================

      return interaction.reply({
        content:
          `✅ Withdrawal request submitted!\n\n` +
          `📦 Item: **${itemName}**\n` +
          `💰 Amount: **${amount.toLocaleString()} coins**\n` +
          `🎮 Nickname: **${nickname}**\n` +
          `🆔 Request ID: **#${withdrawalId}**\n\n` +
          `⏳ Waiting for admin approval.`,
        ephemeral: true
      });

    } catch (error) {
      console.error("Withdraw command error:", error);

      if (!interaction.replied && !interaction.deferred) {
        return interaction.reply({
          content: "❌ Withdrawal system error.",
          ephemeral: true
        });
      }
    }
  },

  // =====================================================
  // BUTTON HANDLER
  // =====================================================

  async handleInteraction(interaction) {
    try {

      // =================================================
      // APPROVE
      // =================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith("withdraw_approve_")
      ) {
        const adminId = process.env.ADMIN_ID;

        if (
          adminId &&
          interaction.user.id !== adminId
        ) {
          return interaction.reply({
            content: "❌ You are not allowed to approve withdrawals.",
            ephemeral: true
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
            content: "❌ Withdrawal request not found.",
            ephemeral: true
          });
        }

        const withdrawal = result.rows[0];

        if (withdrawal.status !== "pending") {
          return interaction.reply({
            content:
              `❌ This withdrawal is already **${withdrawal.status}**.`,
            ephemeral: true
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

        const itemNames = {
          iron: "⛓️ Iron",
          water: "💧 Water",
          wood: "🪵 Wood",
          stone: "🪨 Stone",
          bread: "🍞 Bread"
        };

        const approvedEmbed = new EmbedBuilder()
          .setTitle("✅ Withdrawal Approved")
          .setColor(0x2ECC71)
          .addFields(
            {
              name: "👤 Player",
              value: `<@${withdrawal.discord_id}>`,
              inline: true
            },
            {
              name: "📦 Item",
              value:
                itemNames[withdrawal.item_type] ||
                withdrawal.item_type,
              inline: true
            },
            {
              name: "💰 Amount",
              value:
                `${Number(withdrawal.amount).toLocaleString()} coins`,
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
            `✅ Your withdrawal has been approved!\n\n` +
            `📦 Item: **${
              itemNames[withdrawal.item_type] ||
              withdrawal.item_type
            }**\n` +
            `💰 Amount: **${Number(
              withdrawal.amount
            ).toLocaleString()} coins**\n` +
            `🎮 Nickname: **${withdrawal.nickname}**\n` +
            `🆔 Request ID: **#${withdrawal.id}**`
          );
        } catch (error) {
          console.error(
            "Could not DM player:",
            error
          );
        }

        return;
      }

      // =================================================
      // REJECT
      // =================================================

      if (
        interaction.isButton() &&
        interaction.customId.startsWith("withdraw_reject_")
      ) {
        const adminId = process.env.ADMIN_ID;

        if (
          adminId &&
          interaction.user.id !== adminId
        ) {
          return interaction.reply({
            content: "❌ You are not allowed to reject withdrawals.",
            ephemeral: true
          });
        }

        const withdrawalId =
          interaction.customId.replace(
            "withdraw_reject_",
            ""
          );

        const client = await pool.connect();

        let withdrawal;

        try {
          await client.query("BEGIN");

          const result = await client.query(
            `
            SELECT *
            FROM withdrawals
            WHERE id = $1
            FOR UPDATE
            `,
            [withdrawalId]
          );

          if (result.rows.length === 0) {
            await client.query("ROLLBACK");
            client.release();

            return interaction.reply({
              content: "❌ Withdrawal request not found.",
              ephemeral: true
            });
          }

          withdrawal = result.rows[0];

          if (withdrawal.status !== "pending") {
            await client.query("ROLLBACK");
            client.release();

            return interaction.reply({
              content:
                `❌ This withdrawal is already **${withdrawal.status}**.`,
              ephemeral: true
            });
          }

          // Refund coins
          await client.query(
            `
            UPDATE users
            SET coins = coins + $1
            WHERE discord_id = $2
            `,
            [
              Number(withdrawal.amount),
              withdrawal.discord_id
            ]
          );

          // Mark rejected
          await client.query(
            `
            UPDATE withdrawals
            SET status = 'rejected'
            WHERE id = $1
            `,
            [withdrawalId]
          );

          await client.query("COMMIT");

        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }

        const itemNames = {
          iron: "⛓️ Iron",
          water: "💧 Water",
          wood: "🪵 Wood",
          stone: "🪨 Stone",
          bread: "🍞 Bread"
        };

        const rejectedEmbed = new EmbedBuilder()
          .setTitle("❌ Withdrawal Rejected")
          .setColor(0xE74C3C)
          .addFields(
            {
              name: "👤 Player",
              value: `<@${withdrawal.discord_id}>`,
              inline: true
            },
            {
              name: "📦 Item",
              value:
                itemNames[withdrawal.item_type] ||
                withdrawal.item_type,
              inline: true
            },
            {
              name: "💰 Amount",
              value:
                `${Number(
                  withdrawal.amount
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
              value: "❌ Rejected — Coins Refunded",
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
            `❌ Your withdrawal was rejected.\n\n` +
            `📦 Item: **${
              itemNames[withdrawal.item_type] ||
              withdrawal.item_type
            }**\n` +
            `💰 Refunded: **${Number(
              withdrawal.amount
            ).toLocaleString()} coins**\n` +
            `🎮 Nickname: **${withdrawal.nickname}**\n` +
            `🆔 Request ID: **#${withdrawal.id}**`
          );
        } catch (error) {
          console.error(
            "Could not DM player:",
            error
          );
        }

        return;
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
        await interaction.reply({
          content:
            "❌ Something went wrong while processing withdrawal.",
          ephemeral: true
        });
      }
    }
  }
};
