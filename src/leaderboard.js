const {
  SlashCommandBuilder,
  EmbedBuilder
} = require("discord.js");

const { pool } = require("../../database/database");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Show the top coin earners"),

  async execute(interaction) {
    try {
      const result = await pool.query(`
        SELECT
          discord_id,
          coins,
          total_earned
        FROM users
        ORDER BY total_earned DESC
        LIMIT 10
      `);

      if (result.rows.length === 0) {
        return interaction.reply({
          content: "📊 No users found yet."
        });
      }

      let description = "";

      result.rows.forEach((user, index) => {
        const position = index + 1;

        let medal = `${position}.`;

        if (position === 1) medal = "🥇";
        if (position === 2) medal = "🥈";
        if (position === 3) medal = "🥉";

        description +=
          `${medal} <@${user.discord_id}> — ` +
          `**${Number(user.total_earned).toLocaleString()} coins earned**\n`;
      });

      const embed = new EmbedBuilder()
        .setTitle("🏆 Coin Leaderboard")
        .setDescription(description)
        .setFooter({
          text: "Top 10 coin earners"
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed]
      });

    } catch (error) {
      console.error("❌ Leaderboard error:", error);

      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "❌ Could not load the leaderboard.",
          ephemeral: true
        });
      }
    }
  }
};
