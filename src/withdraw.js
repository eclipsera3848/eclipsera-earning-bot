const {
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const { pool } = require("./database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Request a coin withdrawal"),
  .addStringOption(option =>
  option
    .setName("resource")
    .setDescription("Select the resource you want to withdraw")
    .setRequired(true)
    .addChoices(
      { name: "⛓️ Iron", value: "iron" },
      { name: "💧 Water", value: "water" },
      { name: "🪵 Wood", value: "wood" },
      { name: "🪨 Stone", value: "stone" },
      { name: "🍞 Bread", value: "bread" }
    )
)

  async execute(interaction) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS withdrawals (
          id SERIAL PRIMARY KEY,
          discord_id VARCHAR(50) NOT NULL,
          amount BIGINT NOT NULL,
          nickname TEXT NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      const modal = new ModalBuilder()
        .setCustomId("withdraw_modal")
        .setTitle("💸 Withdraw Coins");

      const amountInput = new TextInputBuilder()
        .setCustomId("withdraw_amount")
        .setLabel("Withdrawal Amount")
        .setPlaceholder("Example: 1000")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nicknameInput = new TextInputBuilder()
        .setCustomId("game_nickname")
        .setLabel("In-Game Nickname")
        .setPlaceholder("Enter your in-game nickname")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(amountInput),
        new ActionRowBuilder().addComponents(nicknameInput)
      );

      await interaction.showModal(modal);
    } catch (error) {
      console.error("Withdraw command error:", error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Withdrawal system error.",
          ephemeral: true
        });
      }
    }
  },

  async handleInteraction(interaction) {
    try {
      // =========================
      // WITHDRAW MODAL
      // =========================

      if (
        interaction.isModalSubmit() &&
        interaction.customId === "withdraw_modal"
      ) {
        const amountText =
          interaction.fields.getTextInputValue("withdraw_amount");

        const nickname =
          interaction.fields
            .getTextInputValue("game_nickname")
            .trim();

        const amount = Number(amountText);

        if (!Number.isInteger(amount) || amount <= 0) {
          return interaction.reply({
            content: "❌ Please enter a valid withdrawal amount.",
            ephemeral: true
          });
        }

        if (!nickname) {
          return interaction.reply({
            content: "❌ Please enter your in-game nickname.",
            ephemeral: true
          });
        }

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
              `❌ Insufficient balance.\n` +
              `💰 Your balance: **${balance.toLocaleString()} coins**`,
            ephemeral: true
          });
        }

        await pool.query("BEGIN");

        try {
          const updateResult = await pool.query(
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
            await pool.query("ROLLBACK");

            return interaction.reply({
              content: "❌ Your balance changed. Please try again.",
              ephemeral: true
            });
          }

          const withdrawalResult = await pool.query(
            `
            INSERT INTO withdrawals
              (discord_id, amount, nickname, status)
            VALUES
              ($1, $2, $3, 'pending')
            RETURNING id
            `,
            [interaction.user.id, amount, nickname]
          );

          await pool.query("COMMIT");

          const withdrawalId =
            withdrawalResult.rows[0].id;

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

          const adminId = process.env.ADMIN_ID;

          if (adminId) {
            try {
              const adminUser =
                await interaction.client.users.fetch(adminId);

              await adminUser.send({
                embeds: [embed],
                components: [buttons]
              });
            } catch (dmError) {
              console.error(
                "Could not send withdrawal request to admin:",
                dmError
              );
            }
          }

          return interaction.reply({
            content:
              `✅ Withdrawal request submitted!\n\n` +
              `💰 Amount: **${amount.toLocaleString()} coins**\n` +
              `🎮 Nickname: **${nickname}**\n` +
              `🆔 Request ID: **#${withdrawalId}**\n\n` +
              `⏳ Waiting for approval.`,
            ephemeral: true
          });
        } catch (error) {
          await pool.query("ROLLBACK");
          throw error;
        }
      }

      // =========================
      // APPROVE BUTTON
      // =========================

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
            content:
              "❌ Withdrawal request not found.",
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
              value: "✅ Approved",
              inline: true
            }
          )
          .setTimestamp();

        await interaction.update({
          embeds: [approvedEmbed],
          components: []
        });

        try {
          const player =
            await interaction.client.users.fetch(
              withdrawal.discord_id
            );

          await player.send(
            `✅ Your withdrawal has been approved!\n\n` +
            `💰 Amount: **${Number(
              withdrawal.amount
            ).toLocaleString()} coins**\n` +
            `🎮 In-Game Nickname: **${withdrawal.nickname}**\n` +
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

      // =========================
      // REJECT BUTTON
      // =========================

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
            ephemeral: true
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
              ephemeral: true
            });
          }

          const withdrawal = result.rows[0];

          if (withdrawal.status !== "pending") {
            await pool.query("ROLLBACK");

            return interaction.reply({
              content:
                `❌ This withdrawal is already **${withdrawal.status}**.`,
              ephemeral: true
            });
          }

          await pool.query(
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

          await pool.query(
            `
            UPDATE withdrawals
            SET status = 'rejected'
            WHERE id = $1
            `,
            [withdrawalId]
          );

          await pool.query("COMMIT");

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

          try {
            const player =
              await interaction.client.users.fetch(
                withdrawal.discord_id
              );

            await player.send(
              `❌ Your withdrawal was rejected.\n\n` +
              `💰 Refunded: **${Number(
                withdrawal.amount
              ).toLocaleString()} coins**\n` +
              `🎮 In-Game Nickname: **${withdrawal.nickname}**\n` +
              `🆔 Request ID: **#${withdrawal.id}**`
            );
          } catch (error) {
            console.error(
              "Could not DM player:",
              error
            );
          }

          return;
        } catch (error) {
          await pool.query("ROLLBACK");
          throw error;
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
        await interaction.reply({
          content:
            "❌ Something went wrong while processing withdrawal.",
          ephemeral: true
        });
      }
    }
  }
};
