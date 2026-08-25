const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const { pool } = require("../database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top Eclipsera coin earners"),

  async execute(interaction) {
    try {
      const result = await pool.query(`
        SELECT discord_id, coins
        FROM users
        ORDER BY coins DESC
        LIMIT 10
      `);

      if (result.rows.length === 0) {
        return interaction.reply({
          content: "📊 No players have earned coins yet."
        });
      }

      const medals = ["🥇", "🥈", "🥉"];

      const lines = result.rows.map((user, index) => {
        const medal = medals[index] || `**${index + 1}.**`;

        return `${medal} <@${user.discord_id}> — **${Number(
          user.coins
        ).toLocaleString()} coins**`;
      });

      const embed = new EmbedBuilder()
        .setTitle("🏆 Eclipsera Coin Leaderboard")
        .setDescription(lines.join("\n"))
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

    } catch (error) {
      console.error("❌ Leaderboard error:", error);

      await interaction.reply({
        content: "❌ Could not load the leaderboard.",
        ephemeral: true
      });
    }
  }
};
