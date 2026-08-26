const { EmbedBuilder } = require("discord.js");

const { pool } = require("./database/database");

module.exports = {
  data: {
    name: "approve"
  },

  async handleButton(interaction) {
    const customId = interaction.customId;

    const parts = customId.split("_");

    const action = parts[1];
    const requestId = parts[2];

    try {
      const result = await pool.query(
        `
        SELECT *
        FROM requests
        WHERE id = $1
        `,
        [requestId]
      );

      if (result.rows.length === 0) {
        return interaction.reply({
          content: "❌ Request not found.",
          ephemeral: true
        });
      }

      const request = result.rows[0];

      if (request.status !== "PENDING") {
        return interaction.reply({
          content:
            `❌ This request is already **${request.status}**.`,
          ephemeral: true
        });
      }

      // =========================
      // APPROVE
      // =========================

      if (action === "approve") {
        await pool.query(
          `
          UPDATE users
          SET
            reserved_coins = reserved_coins - $1,
            total_spent = total_spent + $1
          WHERE discord_id = $2
          `,
          [
            request.coin_cost,
            request.discord_id
          ]
        );

        await pool.query(
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

        await pool.query(
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
            $3,
            $4
          )
          `,
          [
            request.discord_id,
            request.coin_cost,
            `Withdrawal approved for ${request.resource}`,
            requestId
          ]
        );

        const embed = new EmbedBuilder()
          .setTitle("✅ Withdrawal Approved")
          .setColor(0x2ecc71)
          .addFields(
            {
              name: "👤 Discord User",
              value: `<@${request.discord_id}>`,
              inline: true
            },
            {
              name: "🎮 In-Game Nickname",
              value: request.nickname || "Not provided",
              inline: true
            },
            {
              name: "📦 Resource",
              value: String(request.resource || "N/A").toUpperCase(),
              inline: true
            },
            {
              name: "🔢 Amount",
              value: Number(request.amount || 0).toLocaleString(),
              inline: true
            },
            {
              name: "🪙 Coins",
              value: Number(request.coin_cost || 0).toLocaleString(),
              inline: true
            },
            {
              name: "🆔 Request ID",
              value: `#${requestId}`,
              inline: true
            },
            {
              name: "👮 Approved By",
              value: `<@${interaction.user.id}>`,
              inline: true
            }
          )
          .setTimestamp();

        await interaction.update({
          embeds: [embed],
          components: []
        });

        return;
      }

      // =========================
      // REJECT
      // =========================

      if (action === "reject") {
        await pool.query(
          `
          UPDATE users
          SET
            coins = coins + $1,
            reserved_coins = reserved_coins - $1
          WHERE discord_id = $2
          `,
          [
            request.coin_cost,
            request.discord_id
          ]
        );

        await pool.query(
          `
          UPDATE requests
          SET
            status = 'REJECTED',
            approved_at = CURRENT_TIMESTAMP,
            approved_by = $1
          WHERE id = $2
          `,
          [
            interaction.user.id,
            requestId
          ]
        );

        await pool.query(
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
            'WITHDRAW_REFUND',
            $2,
            $3,
            $4
          )
          `,
          [
            request.discord_id,
            request.coin_cost,
            "Withdrawal rejected - coins refunded",
            requestId
          ]
        );

        const embed = new EmbedBuilder()
          .setTitle("❌ Withdrawal Rejected")
          .setColor(0xe74c3c)
          .addFields(
            {
              name: "👤 Discord User",
              value: `<@${request.discord_id}>`,
              inline: true
            },
            {
              name: "🎮 In-Game Nickname",
              value: request.nickname || "Not provided",
              inline: true
            },
            {
              name: "📦 Resource",
              value: String(request.resource || "N/A").toUpperCase(),
              inline: true
            },
            {
              name: "🔢 Amount",
              value: Number(request.amount || 0).toLocaleString(),
              inline: true
            },
            {
              name: "🪙 Coins Refunded",
              value: Number(request.coin_cost || 0).toLocaleString(),
              inline: true
            },
            {
              name: "🆔 Request ID",
              value: `#${requestId}`,
              inline: true
            },
            {
              name: "👮 Rejected By",
              value: `<@${interaction.user.id}>`,
              inline: true
            }
          )
          .setTimestamp();

        await interaction.update({
          embeds: [embed],
          components: []
        });

        return;
      }

      return interaction.reply({
        content: "❌ Invalid action.",
        ephemeral: true
      });

    } catch (error) {
      console.error("❌ Approval error:", error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Something went wrong.",
          ephemeral: true
        });
      }
    }
  }
};
