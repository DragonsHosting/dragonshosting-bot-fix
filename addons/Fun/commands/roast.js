/*
  _____            _           ____        _   
 |  __ \          | |         |  _ \      | |  
 | |  | |_ __ __ _| | _____   | |_) | ___ | |_ 
 | |  | | '__/ _` | |/ / _ \  |  _ < / _ \| __|
 | |__| | | | (_| |   < (_) | | |_) | (_) | |_ 
 |_____/|_|  \__,_|_|\_\___/  |____/ \___/ \__|
                                             
                                        
 Thank you for choosing DragonHosting!

 Should you encounter any issues, require assistance, or have suggestions for improving the bot,
 we invite you to connect with us on our Discord server and create a support ticket: 

 https://discord.gg/DragonsHosting
 
*/

const { SlashCommandBuilder } = require('discord.js');
   
const roasts = [
    "I'd agree with you but then we'd both be wrong.",
    "You're not stupid; you just have bad luck thinking.",
    "If laughter is the best medicine, your face must be curing the world.",
    "You're like a cloud. When you disappear, it's a beautiful day.",
    "I'd explain it to you but I left my English-to-Dumb-Dumb Dictionary at home.",
    "You're the reason the gene pool needs a lifeguard.",
    "You bring everyone so much joy when you leave the room.",
    "Some cause happiness wherever they go; you whenever you go.",
    "You're like a software update. When I see you, I think, 'Not now.'",
    "If I had a dollar for every smart thing you say, I'd be in debt.",
    "You're like a slinky, not really good for much but you bring a smile to my face when pushed down the stairs.",
    "I'd give you a nasty look but you've already got one.",
    "You are proof that evolution CAN go in reverse.",
    "Brains aren't everything. In fact, in your case, they're nothing.",
    "I love what you've done with your hair. How do you get it to come out of the nostrils like that?",
    "You're not the dumbest person on the planet, but you sure better hope he doesn't die.",
    "Keep rolling your eyes, you might eventually find a brain.",
    "Your birth certificate is an apology letter from the condom factory.",
    "You're as useless as the 'ueue' in 'queue'.",
    "Mirrors can't talk. Lucky for you, they can't laugh either.",
    "I'd say you're funny, but looks aren't everything.",
    "You're the reason I prefer animals to people.",
    "If ignorance is bliss, you must be the happiest person on earth.",
    "You're like Monday mornings, nobody likes you.",
    "You have the perfect face for radio.",
    "Is that your face? Or is your neck blowing a bubble?",
    "You're so annoying, even autocorrect ignores you.",
    "I'd like to see things from your point of view, but I can't seem to get my head that far up my rear.",
    "You're the human version of a participation award.",
    "If you were an inanimate object, you'd be a participation trophy.",
    "You're like a glow stick. Sometimes I just want to snap you until the light comes on.",
    "If you were any more inane, you'd be a tutorial for how to breathe.",
    "You're like a software update in the middle of an important task: unnecessary and ill-timed.",
    "You're the human equivalent of a typo.",
    "If there was an award for laziness, I'd probably send someone to pick it up for you.",
    "Your cooking is so bad, the homeless give it back.",
    "If you were a vegetable, you'd be a cabbitch.",
    "You're like the end pieces of a loaf of bread. Everyone touches you, but nobody wants you."
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roast')
        .setDescription('Roast a user with a random fun jab')
        .addUserOption(option =>
            option.setName('target')
                .setDescription('The user to roast')
                .setRequired(true)),
    category: 'Fun',
    async execute(interaction, client) {
        const target = interaction.options.getUser('target');

        const roast = roasts[Math.floor(Math.random() * roasts.length)];

        await interaction.reply(`<@${target.id}>, ${roast}`);
    }
};