const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Request resources using your coins")
    .addStringOption(option =>
      option
        .setName("resource")
        .setDescription("Choose the resource")
        .setRequired(true)
        .addChoices(
          { name: "Bread", value: "bread" },
          { name: "Wood", value: "wood" },
          { name: "Stone", value: "stone" },
          { name: "Water", value: "water" },
          { name: "Iron", value: "iron" }
        )
    )
    .addIntegerOption(option =>
      option
        .setName("amount")
        .setDescription("Amount of resources to withdraw")
        .setRequired(true)
        .setMinValue(100)
        .setMaxValue(1000)
    ),

  async execute(interaction) {
    await interaction.reply({
      content: "⏳ Withdrawal system is being processed...",
      ephemeral: true
    });
  }
};
