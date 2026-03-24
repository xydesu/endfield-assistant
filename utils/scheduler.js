const schedule = require('node-schedule');
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const { signIn, buildAttendanceEmbed } = require('./attendance');
const { EMBED_COLOR } = require('./constants');

const jobs = new Map();

async function runSignIn(userId, client) {
    const user = await User.findByPk(userId);
    if (!user) return;

    console.log(`[Scheduler] Running auto sign-in for ${user.discordId}`);
    const result = await signIn(user);

    // Notify user via DM - DISABLED per user request (Only guild channel)
    // try {
    //     const discordUser = await client.users.fetch(userId);
    //     if (discordUser) {
    //         await discordUser.send(`【自動簽到報告】\n${result.message}\n獲得獎勵: ${result.data ? JSON.stringify(result.data) : '無'}`);
    //     }
    // } catch (e) {
    //     console.error(`Failed to DM user ${userId}:`, e);
    // }

    // Notify servers
    try {
        const Server = require('../models/Server');
        const guilds = client.guilds.cache;

        for (const [guildId, guild] of guilds) {
            try {
                // Check if user scoped notifications to a specific guild
                if (user.notifyGuildId && user.notifyGuildId !== guildId) {
                    continue; // Skip if this is not the target guild
                }

                const serverConfig = await Server.findByPk(guildId);
                if (serverConfig && serverConfig.notifyChannelId) {
                    try {
                        await guild.members.fetch(userId);
                        const channel = guild.channels.cache.get(serverConfig.notifyChannelId);
                        if (channel) {
                            const embed = buildAttendanceEmbed(EmbedBuilder, EMBED_COLOR, '📅 自動簽到報告', result);

                            const content = user.isTag ? `<@${userId}>` : '';
                            await channel.send({ content: content, embeds: [embed] });
                        }
                    } catch (memberErr) {
                        // User not in guild, ignore
                    }
                }
            } catch (err) {
                console.error(`Error processing guild notification for ${guildId}:`, err);
            }
        }
    } catch (e) {
        console.error('Failed to process server notifications:', e);
    }
}

function scheduleUser(user, client) {
    if (jobs.has(user.discordId)) {
        jobs.get(user.discordId).cancel();
    }

    if (!user.autoSignTime) return;

    const [hour, minute] = user.autoSignTime.split(':');
    const rule = new schedule.RecurrenceRule();
    rule.hour = parseInt(hour, 10);
    rule.minute = parseInt(minute, 10);

    const job = schedule.scheduleJob(rule, () => runSignIn(user.discordId, client));
    jobs.set(user.discordId, job);
    console.log(`[Scheduler] Scheduled job for ${user.discordId} at ${user.autoSignTime}`);
}

function cancelUser(userId) {
    if (jobs.has(userId)) {
        jobs.get(userId).cancel();
        jobs.delete(userId);
        console.log(`[Scheduler] Cancelled job for ${userId}`);
    }
}

async function initScheduler(client) {
    const users = await User.findAll();
    for (const user of users) {
        if (user.autoSignTime) {
            scheduleUser(user, client);
        }
    }
    console.log(`[Scheduler] Initialized ${jobs.size} jobs.`);
}

module.exports = { initScheduler, scheduleUser, cancelUser };
