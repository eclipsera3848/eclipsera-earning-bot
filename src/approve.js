const {
  SlashCommandBuilder
} = require("discord.js");

const {
  pool
} = require("../database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("approve")
    .setDescription("Approve a withdrawal request")
    .addIntegerOption(option =>
      option
        .setName("request_id")
        .setDescription("Withdrawal request ID")
        .setRequired(true)
    ),

  async execute(interaction) {
    // Only the configured admin can approve
    if (interaction.user.id !== process.env.ADMIN_USER_ID) {
      return interaction.reply({
        content: "❌ You are not authorized to approve requests.",
        ephemeral: true
      });
    }

    const requestId = interaction.options.getInteger("request_id");

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
          content: `❌ Request #${requestId} was not found.`,
          ephemeral: true
        });
      }

      const request = result.rows[0];

      if (request.status !== "PENDING") {
        return interaction.reply({
          content:
            `❌ Request #${requestId} is already **${request.status}**.`,
          ephemeral: true
        });
      }

      // Finalize the reserved coins
      await pool.query(
        `
        UPDATE users
        SET reserved_coins = reserved_coins - $1,
            total_spent = total_spent + $1
        WHERE discord_id = $2
        `,
        [request.coin_cost, request.discord_id]
      );

      // Mark request approved
      await pool.query(
        `
        UPDATE requests
        SET status = 'APPROVED',
            approved_at = CURRENT_TIMESTAMP,
            approved_by = $1
        WHERE id = $2
        `,
        [interaction.user.id, requestId]
      );

      // Save transaction
      await pool.query(
        `
        INSERT INTO transactions
          (discord_id, type, amount, reason, request_id)
        VALUES
          ($1, 'WITHDRAW_APPROVED', $2, $3, $4)
        `,
        [
          request.discord_id,
          request.coin_cost,
          `${request.resource} withdrawal approved`,
          requestId
        ]
      );

      await interaction.reply({
        content:
          `✅ **Request #${requestId} approved!**\n\n` +
          `👤 Player: <@${request.discord_id}>\n` +
          `📦 Resource: **${request.resource.toUpperCase()}**\n` +
          `🔢 Amount: **${request.amount}**\n` +
          `🪙 Coins: **${Number(request.coin_cost).toLocaleString()}**`
      });

    } catch (error) {
      console.error("❌ Approve error:", error);

      await interaction.reply({
        content: "❌ Something went wrong while approving the request.",
        ephemeral: true
      });
    }
  }
};
