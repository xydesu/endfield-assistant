const schedule = require('node-schedule');
const { EmbedBuilder } = require('discord.js');
const User = require('../models/User');
const { signIn, buildAttendanceEmbed, getCardDetail } = require('./attendance');
const { EMBED_COLOR } = require('./constants');
const { t } = require('./i18n');

const jobs = new Map();
const dailyJobs = new Map();

const ASIA_SERVER_ID = '2';
const AMERICAS_EUROPE_SERVER_ID = '3';

async function runSignIn(userId, client) {
    const user = await User.findByPk(userId);
    if (!user) return;
    const lang = user.language || 'zh_Hant';

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

        let discordUser = null;
        try {
            discordUser = await client.users.fetch(userId);
        } catch (e) {
            // If fetch fails, author field will simply be omitted
        }

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
                            const embed = buildAttendanceEmbed(EmbedBuilder, EMBED_COLOR, t(lang, 'scheduler_auto_report'), result, discordUser, lang);

                            const content = (!result.success || user.isTag) ? `<@${userId}>` : '';
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

async function checkAndSendDailyNotification(userId, client) {
    const user = await User.findByPk(userId);
    if (!user || !user.dailyNotify) return;
    if (user.dailyNotified) return;

    try {
        const result = await getCardDetail(user);
        if (!result.success) return;

        const { dailyMission } = result.detail;
        if (!dailyMission) return;

        const isComplete = parseInt(dailyMission.dailyActivation, 10) >= parseInt(dailyMission.maxDailyActivation, 10);
        if (isComplete) return;

        await sendDailyNotification(user, dailyMission.dailyActivation, dailyMission.maxDailyActivation, client);
        await user.update({ dailyNotified: true });
        console.log(`[DailyNotify] Notified ${userId} (${dailyMission.dailyActivation}/${dailyMission.maxDailyActivation})`);
    } catch (e) {
        console.error(`[DailyNotify] Error checking daily mission for ${userId}:`, e);
    }
}

async function sendDailyNotification(user, curActivation, maxActivation, client) {
    const lang = user.language || 'zh_Hant';
    try {
        const Server = require('../models/Server');
        const guilds = client.guilds.cache;

        let discordUser = null;
        try {
            discordUser = await client.users.fetch(user.discordId);
        } catch (e) {
            // If fetch fails, author field will simply be omitted
        }

        for (const [guildId, guild] of guilds) {
            try {
                if (user.notifyGuildId && user.notifyGuildId !== guildId) continue;

                const serverConfig = await Server.findByPk(guildId);
                if (serverConfig && serverConfig.notifyChannelId) {
                    try {
                        await guild.members.fetch(user.discordId);
                        const channel = guild.channels.cache.get(serverConfig.notifyChannelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor(EMBED_COLOR)
                                .setTitle(t(lang, 'scheduler_daily_title'))
                                .setDescription(t(lang, 'scheduler_daily_desc')(curActivation, maxActivation))
                                .setTimestamp();
                            const content = user.isDailyTag ? `<@${user.discordId}>` : '';
                            await channel.send({ content, embeds: [embed] });
                        }
                    } catch (memberErr) {
                        // User not in guild, ignore
                    }
                }
            } catch (err) {
                console.error(`[DailyNotify] Error notifying guild ${guildId} for ${user.discordId}:`, err);
            }
        }
    } catch (e) {
        console.error(`[DailyNotify] Failed to send notification for ${user.discordId}:`, e);
    }
}

function scheduleDailyNotifyUser(user, client) {
    if (dailyJobs.has(user.discordId)) {
        dailyJobs.get(user.discordId).cancel();
    }

    if (!user.dailyNotify || !user.dailyNotifyTime) return;

    const [hour, minute] = user.dailyNotifyTime.split(':');
    const rule = new schedule.RecurrenceRule();
    rule.hour = parseInt(hour, 10);
    rule.minute = parseInt(minute, 10);
    rule.tz = 'UTC';

    const job = schedule.scheduleJob(rule, () => checkAndSendDailyNotification(user.discordId, client));
    dailyJobs.set(user.discordId, job);
    console.log(`[DailyNotify] Scheduled notify job for ${user.discordId} at ${user.dailyNotifyTime} UTC`);
}

function cancelDailyNotifyUser(userId) {
    if (dailyJobs.has(userId)) {
        dailyJobs.get(userId).cancel();
        dailyJobs.delete(userId);
        console.log(`[DailyNotify] Cancelled notify job for ${userId}`);
    }
}

async function resetDailyNotified(serverId) {
    try {
        const { Op } = require('sequelize');
        await User.update(
            { dailyNotified: false },
            { where: { dailyNotify: true, serverId, dailyNotified: true } }
        );
        console.log(`[DailyNotify] Reset dailyNotified for server ${serverId}`);
    } catch (e) {
        console.error(`[DailyNotify] Error resetting dailyNotified for server ${serverId}:`, e);
    }
}

async function initScheduler(client) {
    const users = await User.findAll();
    for (const user of users) {
        if (user.autoSignTime) {
            scheduleUser(user, client);
        }
        if (user.dailyNotify && user.dailyNotifyTime) {
            scheduleDailyNotifyUser(user, client);
        }
    }
    console.log(`[Scheduler] Initialized ${jobs.size} sign-in jobs and ${dailyJobs.size} daily notify jobs.`);

    // Check stamina every 30 minutes (at :00 and :30 of each hour)
    const staminaRule = new schedule.RecurrenceRule();
    staminaRule.minute = [0, 30];
    schedule.scheduleJob(staminaRule, () => checkStamina(client));
    console.log('[Scheduler] Stamina check scheduled every 30 minutes.');

    // Reset dailyNotified at each server's daily reset time (04:00 server time):
    // Asia (UTC+8): 04:00 UTC+8 = 20:00 UTC
    // Americas/Europe (UTC-5): 04:00 UTC-5 = 09:00 UTC
    const asiaResetRule = new schedule.RecurrenceRule();
    asiaResetRule.hour = 20;
    asiaResetRule.minute = 0;
    asiaResetRule.tz = 'UTC';
    schedule.scheduleJob(asiaResetRule, () => resetDailyNotified(ASIA_SERVER_ID));
    console.log('[DailyNotify] Asia daily reset job scheduled at 20:00 UTC.');

    const ameResetRule = new schedule.RecurrenceRule();
    ameResetRule.hour = 9;
    ameResetRule.minute = 0;
    ameResetRule.tz = 'UTC';
    schedule.scheduleJob(ameResetRule, () => resetDailyNotified(AMERICAS_EUROPE_SERVER_ID));
    console.log('[DailyNotify] Americas/Europe daily reset job scheduled at 09:00 UTC.');
}

async function sendStaminaNotification(user, curStamina, maxStamina, client) {
    const lang = user.language || 'zh_Hant';
    try {
        const Server = require('../models/Server');
        const guilds = client.guilds.cache;

        let discordUser = null;
        try {
            discordUser = await client.users.fetch(user.discordId);
        } catch (e) {
            // If fetch fails, author field will simply be omitted
        }

        for (const [guildId, guild] of guilds) {
            try {
                if (user.notifyGuildId && user.notifyGuildId !== guildId) continue;

                const serverConfig = await Server.findByPk(guildId);
                if (serverConfig && serverConfig.notifyChannelId) {
                    try {
                        await guild.members.fetch(user.discordId);
                        const channel = guild.channels.cache.get(serverConfig.notifyChannelId);
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor(EMBED_COLOR)
                                .setTitle(t(lang, 'scheduler_stamina_title'))
                                .setDescription(t(lang, 'scheduler_stamina_desc')(curStamina, maxStamina))
                                .setTimestamp();
                            const content = user.isStaminaTag ? `<@${user.discordId}>` : '';
                            await channel.send({ content, embeds: [embed] });
                        }
                    } catch (memberErr) {
                        // User not in guild, ignore
                    }
                }
            } catch (err) {
                console.error(`[Stamina] Error notifying guild ${guildId} for ${user.discordId}:`, err);
            }
        }
    } catch (e) {
        console.error(`[Stamina] Failed to send notification for ${user.discordId}:`, e);
    }
}

async function checkStamina(client) {
    const users = await User.findAll({ where: { staminaNotify: true } });
    for (const user of users) {
        try {
            const result = await getCardDetail(user);
            if (!result.success) continue;

            const { dungeon } = result.detail;
            const curStamina = parseInt(dungeon.curStamina);
            const maxStamina = parseInt(dungeon.maxStamina);
            const threshold = user.staminaThreshold ?? 80;
            const isNearFull = curStamina >= Math.ceil(maxStamina * threshold / 100);

            if (isNearFull && !user.staminaNotified) {
                await sendStaminaNotification(user, curStamina, maxStamina, client);
                await user.update({ staminaNotified: true });
                console.log(`[Stamina] Notified ${user.discordId} (${curStamina}/${maxStamina})`);
            } else if (!isNearFull && user.staminaNotified) {
                // Stamina dropped below threshold — reset so the next peak triggers a new notification
                await user.update({ staminaNotified: false });
            }
        } catch (e) {
            console.error(`[Stamina] Error checking stamina for ${user.discordId}:`, e);
        }
    }
}

module.exports = { initScheduler, scheduleUser, cancelUser, scheduleDailyNotifyUser, cancelDailyNotifyUser };
