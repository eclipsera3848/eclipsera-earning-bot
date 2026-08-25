const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const { pool } = require("./database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reject")
    .setDescription("Reject a pending withdrawal request")
    .addIntegerOption(option =>
      option
        .setName("request_id")
        .setDescription("Withdrawal request ID")
        .setRequired(true)
    ),

  async execute(interaction) {
    try {
      // Admin permission
      if (!interaction.memberPermissions?.has("Administrator")) {
        return interaction.reply({
          content: "❌ Sirf admin ye command use kar sakta hai.",
          ephemeral: true
        });
      }

      const requestId = interaction.options.getInteger("request_id");

      // Request find karo
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
          content: `❌ Request #${requestId} nahi mili.`,
          ephemeral: true
        });
      }

      const request = result.rows[0];

      // Already processed?
      if (request.status !== "PENDING") {
        return interaction.reply({
          content:
            `❌ Request #${requestId} already **${request.status}** hai.`,
          ephemeral: true
        });
      }

      // Request reject karo
      await pool.query(
        `
        UPDATE requests
        SET status = 'REJECTED'
        WHERE id = $1
        `,
        [requestId]
      );

      // Coins refund karo
      await pool.query(
        `
        UPDATE users
        SET coins = coins + $1,
            reserved_coins =
              GREATEST(reserved_coins - $1, 0)
        WHERE discord_id = $2
        `,
        [request.coin_cost, request.discord_id]
      );

      // Transaction
      await pool.query(
        `
        INSERT INTO transactions
        (discord_id, type, amount, reason, request_id)
        VALUES
        ($1, 'WITHDRAW_REFUND', $2, $3, $4)
        `,
        [
          request.discord_id,
          request.coin_cost,
          `Rejected ${request.resource} withdrawal - coins refunded`,
          requestId
        ]
      );

      const embed = new EmbedBuilder()
        .setTitle("❌ Withdrawal Rejected")
        .addFields(
          {
            name: "🆔 Request",
            value: `#${requestId}`,
            inline: true
          },
          {
            name: "👤 Player",
            value: `<@${request.discord_id}>`,
            inline: true
          },
          {
            name: "📦 Resource",
            value: request.resource.toUpperCase(),
            inline: true
          },
          {
            name: "🔢 Amount",
            value: Number(request.amount).toLocaleString(),
            inline: true
          },
          {
            name: "🪙 Coins Refunded",
            value: Number(request.coin_cost).toLocaleString(),
            inline: true
          },
          {
            name: "👮 Rejected By",
            value: `<@${interaction.user.id}>`,
            inline: true
          }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

    } catch (error) {
      console.error("❌ Reject error:");
      console.error(error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Request reject nahi ho saki.",
          ephemeral: true
        });
      }
    }
  }
};
