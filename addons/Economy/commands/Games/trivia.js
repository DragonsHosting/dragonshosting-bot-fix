const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../../../models/UserData');
const { getConfig, getLang } = require('../../../../utils/core/configLoader.js');
const config = getConfig();
const lang = getLang();
const parseDuration = require('../Utility/parseDuration');
const { getTotalEarningsMultiplier } = require('../Utility/helpers');
const { buildComponentsV2Payload, createSimplePlaceholderReplacer } = require('../../../../utils/core/componentsV2Builder');

const shouldUseComponentsV2 = config.ComponentsV2?.Trivia?.Question?.Components ? true : false;

const TRIVIA_QUESTIONS = [
    { question: "What is the capital of France?", answers: ["Paris", "London", "Berlin", "Madrid"], correct: 0, category: "Geography" },
    { question: "Which planet is known as the Red Planet?", answers: ["Venus", "Mars", "Jupiter", "Saturn"], correct: 1, category: "Science" },
    { question: "Who painted the Mona Lisa?", answers: ["Van Gogh", "Picasso", "Da Vinci", "Michelangelo"], correct: 2, category: "Art" },
    { question: "What year did World War II end?", answers: ["1943", "1944", "1945", "1946"], correct: 2, category: "History" },
    { question: "What is the largest ocean on Earth?", answers: ["Atlantic", "Indian", "Arctic", "Pacific"], correct: 3, category: "Geography" },
    { question: "Which element has the chemical symbol 'O'?", answers: ["Gold", "Oxygen", "Osmium", "Oganesson"], correct: 1, category: "Science" },
    { question: "In which year was the first iPhone released?", answers: ["2005", "2006", "2007", "2008"], correct: 2, category: "Technology" },
    { question: "What is the smallest country in the world?", answers: ["Monaco", "Vatican City", "San Marino", "Liechtenstein"], correct: 1, category: "Geography" },
    { question: "Who wrote 'Romeo and Juliet'?", answers: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Mark Twain"], correct: 1, category: "Literature" },
    { question: "What is the hardest natural substance on Earth?", answers: ["Gold", "Iron", "Diamond", "Platinum"], correct: 2, category: "Science" },
    { question: "Which country has the most natural lakes?", answers: ["USA", "Russia", "Canada", "Brazil"], correct: 2, category: "Geography" },
    { question: "What is the speed of light?", answers: ["299,792 km/s", "150,000 km/s", "500,000 km/s", "1,000,000 km/s"], correct: 0, category: "Science" },
    { question: "Who discovered penicillin?", answers: ["Marie Curie", "Alexander Fleming", "Louis Pasteur", "Joseph Lister"], correct: 1, category: "Science" },
    { question: "What is the largest mammal in the world?", answers: ["Elephant", "Blue Whale", "Giraffe", "Hippopotamus"], correct: 1, category: "Nature" },
    { question: "In what year did the Titanic sink?", answers: ["1910", "1911", "1912", "1913"], correct: 2, category: "History" },
    { question: "What is the capital of Japan?", answers: ["Seoul", "Beijing", "Tokyo", "Bangkok"], correct: 2, category: "Geography" },
    { question: "How many sides does a hexagon have?", answers: ["5", "6", "7", "8"], correct: 1, category: "Math" },
    { question: "What is the largest planet in our solar system?", answers: ["Saturn", "Neptune", "Jupiter", "Uranus"], correct: 2, category: "Science" },
    { question: "Who invented the telephone?", answers: ["Thomas Edison", "Nikola Tesla", "Alexander Graham Bell", "Guglielmo Marconi"], correct: 2, category: "History" },
    { question: "What is the currency of the United Kingdom?", answers: ["Euro", "Dollar", "Pound Sterling", "Franc"], correct: 2, category: "General" },
    { question: "Which planet has the most moons?", answers: ["Jupiter", "Saturn", "Uranus", "Neptune"], correct: 1, category: "Science" },
    { question: "What year did the Berlin Wall fall?", answers: ["1987", "1988", "1989", "1990"], correct: 2, category: "History" },
    { question: "What is the longest river in the world?", answers: ["Amazon", "Nile", "Mississippi", "Yangtze"], correct: 1, category: "Geography" },
    { question: "How many bones are in the adult human body?", answers: ["186", "206", "226", "246"], correct: 1, category: "Science" },
    { question: "What is the chemical symbol for gold?", answers: ["Go", "Gd", "Au", "Ag"], correct: 2, category: "Science" },
    { question: "Which country is known as the Land of the Rising Sun?", answers: ["China", "Korea", "Japan", "Thailand"], correct: 2, category: "Geography" },
    { question: "Who was the first person to walk on the moon?", answers: ["Buzz Aldrin", "Neil Armstrong", "Michael Collins", "John Glenn"], correct: 1, category: "History" },
    { question: "What is the main ingredient in guacamole?", answers: ["Tomato", "Avocado", "Lime", "Onion"], correct: 1, category: "Food" },
    { question: "How many continents are there?", answers: ["5", "6", "7", "8"], correct: 2, category: "Geography" },
    { question: "What is the square root of 144?", answers: ["10", "11", "12", "13"], correct: 2, category: "Math" }
];

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function getRandomQuestions(count) {
    return shuffleArray(TRIVIA_QUESTIONS).slice(0, count);
}

function createProgressBar(current, total, length = 10) {
    const filled = Math.round((current / total) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

module.exports = {
    name: 'trivia',
    description: 'Test your knowledge in a trivia challenge',
    options: (subcommand) => subcommand
        .setName('trivia')
        .setDescription('Test your knowledge in a trivia challenge!'),

    async execute(interaction) {
        let user = await User.findOne(
            { userId: interaction.user.id, guildId: interaction.guild.id },
            { balance: 1, commandData: 1, transactionLogs: 1, boosters: 1, pets: 1, activePetId: 1, prestigeLevel: 1 }
        );

        if (!user) {
            user = new User({
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                balance: 0,
                commandData: {},
                transactionLogs: []
            });
        }

        const now = Date.now();
        const triviaConfig = config.Trivia || {};
        const baseCooldown = parseDuration(triviaConfig.baseCooldown || '4h');

        if (user.commandData?.lastTrivia) {
            const lastTrivia = new Date(user.commandData.lastTrivia).getTime();
            const lastCooldown = user.commandData.triviaCooldown || baseCooldown;
            const nextTrivia = lastTrivia + lastCooldown;

            if (now < nextTrivia) {
                const timeRemaining = nextTrivia - now;
                const days = Math.floor(timeRemaining / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

                if (shouldUseComponentsV2) {
                    const placeholders = {
                        nextGame: Math.floor(nextTrivia / 1000),
                        timeRemaining: `${days > 0 ? `${days} day(s) and ` : ''}${hours} hour(s)`
                    };
                    const replacer = createSimplePlaceholderReplacer(placeholders);
                    const payload = buildComponentsV2Payload(config.ComponentsV2.Trivia.Cooldown, replacer);
                    return interaction.reply({ ...payload, flags: MessageFlags.IsComponentsV2 });
                }

                const embed = new EmbedBuilder()
                    .setTitle('Trivia - On Cooldown')
                    .setDescription('**You need to wait before playing again**')
                    .addFields(
                        {
                            name: '📊 Cooldown Status',
                            value: [
                                `> You've already played trivia recently.`,
                                `> Next game available: <t:${Math.floor(nextTrivia / 1000)}:F>`,
                                `> Time remaining: **${days > 0 ? `${days} day(s) and ` : ''}${hours} hour(s)**`
                            ].join('\n'),
                            inline: false
                        },
                        {
                            name: '📋 Cooldown Info',
                            value: [
                                `> The trivia cooldown is dynamic based on your performance.`,
                                `> Better scores = shorter cooldowns!`
                            ].join('\n'),
                            inline: false
                        }
                    )
                    .setColor('#FF6B6B')
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: `${interaction.user.username}` });

                return interaction.reply({ embeds: [embed] });
            }
        }

        const questionCount = triviaConfig.questionCount || 6;
        const questions = getRandomQuestions(questionCount);
        let currentQuestion = 0;
        let correctAnswers = 0;
        let totalPoints = 0;

        const sendQuestion = async (i, isFirst = false) => {
            const q = questions[currentQuestion];
            const shuffledAnswers = q.answers.map((ans, idx) => ({ text: ans, originalIndex: idx }));
            
            const answerButtons = shuffledAnswers.map((ans, idx) => {
                const labels = ['A', 'B', 'C', 'D'];
                return new ButtonBuilder()
                    .setCustomId(`trivia_${idx}_${ans.originalIndex}`)
                    .setLabel(`${labels[idx]}) ${ans.text}`)
                    .setStyle(ButtonStyle.Secondary);
            });

            const row = new ActionRowBuilder().addComponents(answerButtons);

            const progressBar = createProgressBar(currentQuestion, questionCount);
            const progressText = `${currentQuestion}/${questionCount}`;

            let replyOptions;
            if (shouldUseComponentsV2) {
                const placeholders = {
                    current: currentQuestion + 1,
                    total: questionCount,
                    question: q.question,
                    category: q.category,
                    progressBar,
                    progressText,
                    correct: correctAnswers,
                    points: totalPoints
                };
                const replacer = createSimplePlaceholderReplacer(placeholders);
                const payload = buildComponentsV2Payload(config.ComponentsV2.Trivia.Question, replacer);
                payload.components.push(row.toJSON());
                replyOptions = { ...payload, flags: MessageFlags.IsComponentsV2 };
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('Trivia Challenge')
                    .setDescription([
                        `### Question ${currentQuestion + 1}`,
                        '',
                        `**${q.question}**`,
                        '',
                        `📁 Category: **${q.category}**`
                    ].join('\n'))
                    .addFields(
                        {
                            name: '📊 Progress',
                            value: `${progressBar} ${progressText}`,
                            inline: true
                        },
                        {
                            name: '✅ Correct',
                            value: `${correctAnswers}`,
                            inline: true
                        },
                        {
                            name: '💰 Points',
                            value: `${totalPoints}`,
                            inline: true
                        }
                    )
                    .setColor('#5865F2')
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: `Answer within 30 seconds • ${interaction.user.username}` });
                replyOptions = { embeds: [embed], components: [row] };
            }

            if (isFirst) {
                await interaction.reply(replyOptions);
            } else {
                await i.update(replyOptions);
            }
        };

        await sendQuestion(null, true);

        const message = await interaction.fetchReply();
        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 30000 * questionCount
        });

        collector.on('collect', async i => {
            const [, selectedIdx, originalIdx] = i.customId.split('_');
            const q = questions[currentQuestion];
            const isCorrect = parseInt(originalIdx) === q.correct;

            if (isCorrect) {
                correctAnswers++;
                const pointsPerQuestion = triviaConfig.pointsPerCorrect || 10;
                const bonusPoints = Math.floor((triviaConfig.bonusPerStreak || 2) * correctAnswers);
                totalPoints += pointsPerQuestion + bonusPoints;
            }

            currentQuestion++;

            if (currentQuestion >= questionCount) {
                collector.stop('completed');
                return;
            }

            collector.resetTimer();
            await sendQuestion(i);
        });

        collector.on('end', async (collected, reason) => {
            const multiplier = await getTotalEarningsMultiplier(user, interaction.guild.id);
            const finalPoints = Math.floor(totalPoints * multiplier);
            
            const baseReduction = triviaConfig.cooldownReductionPerCorrect || 0.1;
            const cooldownReduction = Math.min(0.7, correctAnswers * baseReduction);
            const finalCooldown = Math.floor(baseCooldown * (1 - cooldownReduction));

            user.balance += finalPoints;
            if (!user.commandData) user.commandData = {};
            user.commandData.lastTrivia = new Date();
            user.commandData.triviaCooldown = finalCooldown;

            user.transactionLogs.push({
                type: 'trivia',
                amount: finalPoints,
                timestamp: new Date()
            });

            await user.save();

            const cooldownDays = Math.floor(finalCooldown / (1000 * 60 * 60 * 24));
            const cooldownHours = Math.floor((finalCooldown % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const cooldownText = `${cooldownDays > 0 ? `${cooldownDays} day(s) and ` : ''}${cooldownHours} hour(s)`;

            let resultMessage = 'Not bad! You got some questions right!';
            let resultColor = '#FFA500';

            if (correctAnswers === questionCount) {
                resultMessage = 'Perfect score! You\'re a trivia master!';
                resultColor = '#FFD700';
            } else if (correctAnswers >= questionCount * 0.8) {
                resultMessage = 'Well done! You got most of the questions right!';
                resultColor = '#00FF00';
            } else if (correctAnswers >= questionCount * 0.5) {
                resultMessage = 'Not bad! You got some questions right!';
                resultColor = '#FFA500';
            } else if (correctAnswers > 0) {
                resultMessage = 'Keep practicing! You can do better!';
                resultColor = '#FF6B6B';
            } else {
                resultMessage = 'Better luck next time!';
                resultColor = '#FF0000';
            }

            if (shouldUseComponentsV2) {
                const placeholders = {
                    resultMessage,
                    correct: correctAnswers,
                    total: questionCount,
                    points: finalPoints,
                    cooldownText,
                    color: resultColor
                };
                const replacer = createSimplePlaceholderReplacer(placeholders);
                const payload = buildComponentsV2Payload(config.ComponentsV2.Trivia.Results, replacer);
                await interaction.editReply({ ...payload, components: [], flags: MessageFlags.IsComponentsV2 });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('Trivia Challenge - Final Results')
                .setDescription(`**${resultMessage}**`)
                .addFields(
                    {
                        name: '⏱️ Cooldown',
                        value: `> You can play again in **${cooldownText}** based on your performance (${correctAnswers} correct answers).`,
                        inline: false
                    },
                    {
                        name: '📊 Your Score',
                        value: `> **${correctAnswers}** correct out of **${questionCount}** questions`,
                        inline: false
                    },
                    {
                        name: '💰 Points Earned',
                        value: `> You earned **${finalPoints} points**!`,
                        inline: false
                    }
                )
                .setColor(resultColor)
                .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Thanks for playing, ${interaction.user.username}!` });

            await interaction.editReply({ embeds: [embed], components: [] });
        });
    }
};

