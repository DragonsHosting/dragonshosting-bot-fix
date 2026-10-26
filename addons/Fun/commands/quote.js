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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription(`Get a random famous quote`),
    category: 'Fun',
    async execute(interaction) {
        const quotes = [
            "The greatest glory in living lies not in never falling, but in rising every time we fall. {Nelson Mandela}",
            "The way to get started is to quit talking and begin doing - {Walt Disney}",
            "Life is what happens when you're busy making other plans - {John Lennon}",
            "The future belongs to those who believe in the beauty of their dreams - {Eleanor Roosevelt}",
            "It is during our darkest moments that we must focus to see the light - {Aristotle}",
            "Whoever is happy will make others happy too - {Anne Frank}",
            "Do not go where the path may lead, go instead where there is no path and leave a trail - {Ralph Waldo Emerson}",
            "Spread love everywhere you go. Let no one ever come to you without leaving happier - {Mother Teresa}",
            "Tell me and I forget. Teach me and I remember. Involve me and I learn - {Benjamin Franklin}",
            "The best and most beautiful things in the world cannot be seen or even touched — they must be felt with the heart - {Helen Keller}",
            "It is better to be hated for what you are than to be loved for what you are not - {André Gide}",
            "I have learned that people will forget what you said, people will forget what you did, but people will never forget how you made them feel - {Maya Angelou}",
            "Whether you think you can or you think you can't, you're right - {Henry Ford}",
            "Perfection is not attainable, but if we chase perfection we can catch excellence - {Vince Lombardi}",
            "Life is 10% what happens to us and 90% how we react to it - {Charles R. Swindoll}",
            "To handle yourself, use your head; to handle others, use your heart - {Eleanor Roosevelt}",
            "Too many of us are not living our dreams because we are living our fears - {Les Brown}",
            "Do what you can, with what you have, where you are - {Theodore Roosevelt}",
            "If you look at what you have in life, you'll always have more. If you look at what you don't have in life, you'll never have enough - {Oprah Winfrey}",
            "None but ourselves can free our minds - {Bob Marley}",
            "I alone cannot change the world, but I can cast a stone across the water to create many ripples - {Mother Teresa}",
            "What we think, we become - {Buddha}",
            "The most difficult thing is the decision to act, the rest is merely tenacity - {Amelia Earhart}",
            "Everything you've ever wanted is on the other side of fear - {George Addair}",
            "What you get by achieving your goals is not as important as what you become by achieving your goals - {Zig Ziglar}",
            "Believe you can and you're halfway there - {Theodore Roosevelt}",
            "When you reach the end of your rope, tie a knot in it and hang on - {Franklin D. Roosevelt}",
            "There is nothing permanent except change - {Heraclitus}",
            "You cannot shake hands with a clenched fist - {Indira Gandhi}",
            "Let us sacrifice our today so that our children can have a better tomorrow - {A. P. J. Abdul Kalam}",
            "It is always the simple that produces the marvelous - {Amelia Barr}",
            "The only journey is the one within - {Rainer Maria Rilke}",
            "Good judgment comes from experience, and a lot of that comes from bad judgment - {Will Rogers}",
            "Life is either a daring adventure or nothing at all - {Helen Keller}",
            "The only limit to our realization of tomorrow will be our doubts of today - {Franklin D. Roosevelt}",
            "Happiness is not something ready made. It comes from your own actions - {Dalai Lama}",
            "If you want to live a happy life, tie it to a goal, not to people or things - {Albert Einstein}",
            "Never let the fear of striking out keep you from playing the game - {Babe Ruth}",
            "Money and success don’t change people; they merely amplify what is already there - {Will Smith}",
            "Your time is limited, don’t waste it living someone else’s life - {Steve Jobs}",
            "Not how long, but how well you have lived is the main thing - {Seneca}",
            "If life were predictable it would cease to be life, and be without flavor - {Eleanor Roosevelt}",
            "The whole secret of a successful life is to find out what is one’s destiny to do, and then do it - {Henry Ford}",
            "In order to write about life first you must live it - {Ernest Hemingway}",
            "The big lesson in life, baby, is never be scared of anyone or anything - {Frank Sinatra}",
            "Sing like no one’s listening, love like you’ve never been hurt, dance like nobody’s watching, and live like it’s heaven on earth - {Mark Twain}",
            "Curiosity about life in all of its aspects, I think, is still the secret of great creative people - {Leo Burnett}",
            "Life is not a problem to be solved, but a reality to be experienced - {Søren Kierkegaard}",
            "The unexamined life is not worth living - {Socrates}",
            "Turn your wounds into wisdom - {Oprah Winfrey}",
            "The way I see it, if you want the rainbow, you gotta put up with the rain - {Dolly Parton}",
            "Do all the good you can, for all the people you can, in all the ways you can, as long as you can - {Hillary Clinton}",
            "Don’t settle for what life gives you; make life better and build something - {Ashton Kutcher}",
            "Everything negative – pressure, challenges – is all an opportunity for me to rise - {Kobe Bryant}",
            "I like criticism. It makes you strong - {LeBron James}",
            "You never really learn much from hearing yourself speak - {George Clooney}",
            "Life imposes things on you that you can’t control, but you still have the choice of how you’re going to live through this - {Celine Dion}",
            "Life is really simple, but men insist on making it complicated - {Confucius}",
            "Life is a succession of lessons which must be lived to be understood - {Ralph Waldo Emerson}",
            "My mama always said, life is like a box of chocolates. You never know what you're gonna get - {Forrest Gump}",
            "Watch your thoughts; they become words. Watch your words; they become actions. Watch your actions; they become habits. Watch your habits; they become character. Watch your character; it becomes your destiny - {Lao Tzu}",
            "The greatest pleasure of life is love - {Euripides}",
            "Life is what we make it, always has been, always will be - {Grandma Moses}",
            "Life's tragedy is that we get old too soon and wise too late - {Benjamin Franklin}",
            "Life is about making an impact, not making an income - {Kevin Kruse}",
            "I’ve failed over and over and over again in my life and that is why I succeed - {Michael Jordan}",
            "Every strike brings me closer to the next home run - {Babe Ruth}",
            "Life is a dream for the wise, a game for the fool, a comedy for the rich, a tragedy for the poor - {Sholom Aleichem}",
            "When we do the best we can, we never know what miracle is wrought in our life or the life of another - {Helen Keller}",
            "The healthiest response to life is joy - {Deepak Chopra}",
            "Life is like riding a bicycle. To keep your balance, you must keep moving - {Albert Einstein}",
            "Life is a flower of which love is the honey - {Victor Hugo}",
            "Keep smiling, because life is a beautiful thing and there’s so much to smile about - {Marilyn Monroe}",
            "Health is the greatest gift, contentment the greatest wealth, faithfulness the best relationship - {Buddha}"
        ]

        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        const parts = randomQuote.split(' - ');

        const quoteText = parts[0];
        const author = parts[1].replace('{', '').replace('}', '');

        await interaction.reply(`\`\`\`ansi\n"${quoteText}" - \x1b[2;34m[${author}]\x1b[0m\n\`\`\``);
    }
}