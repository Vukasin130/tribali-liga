import { query } from "./db.ts";

// Every number here comes from real, already-timestamped rows already in the DB (no
// separate event-tracking system exists yet - see the plan this was built against for
// why: true click/screen-view/session tracking needs new instrumentation across every
// screen, which is a separate, much larger project). This is what's honestly available
// today: registrations, participation, and engagement actions people actually took.

interface DailyCount {
  day: string;
  count: number;
}

async function dailySeries(eventsUnionSql: string): Promise<DailyCount[]> {
  const result = await query<{ day: string; count: number }>(
    `select d::date as day, coalesce(c.n, 0)::int as count
     from generate_series(current_date - interval '29 days', current_date, interval '1 day') as d
     left join (
       select date_trunc('day', ts) as day, count(*) as n
       from (${eventsUnionSql}) events
       where ts >= current_date - interval '29 days'
       group by 1
     ) c on c.day = d
     order by d`
  );
  return result.rows.map((row) => ({ day: row.day, count: Number(row.count) }));
}

async function totalWithRecent(table: string, timestampColumn: string) {
  const result = await query<{ total: string; last_7_days: string }>(
    `select count(*)::int as total, count(*) filter (where ${timestampColumn} >= now() - interval '7 days')::int as last_7_days
     from public.${table}`
  );
  return { total: Number(result.rows[0].total), last7Days: Number(result.rows[0].last_7_days) };
}

interface MiniLeagueAdminRow {
  id: string;
  name: string;
  invite_code: string;
  created_at: string;
  season_name: string;
  creator_name: string;
  member_count: string;
}

export async function getAnalyticsOverview() {
  const [
    users,
    registrationsPerDay,
    activityPerDay,
    fantasy,
    storyViews,
    storyLikes,
    goalVotes,
    matchPredictions,
    content,
    verification,
    adminActivity,
    miniLeagueSummary,
    miniLeagueList
  ] = await Promise.all([
      query<{
        total: string;
        fans: string;
        verified_players: string;
        admins: string;
        verification_none: string;
        verification_pending: string;
        verification_approved: string;
        verification_rejected: string;
        new_last_7_days: string;
        new_last_30_days: string;
      }>(
        `select
           count(*)::int as total,
           count(*) filter (where role = 'fan')::int as fans,
           count(*) filter (where role = 'verified_player')::int as verified_players,
           count(*) filter (where role = 'admin')::int as admins,
           count(*) filter (where verification_status = 'none')::int as verification_none,
           count(*) filter (where verification_status = 'pending')::int as verification_pending,
           count(*) filter (where verification_status = 'approved')::int as verification_approved,
           count(*) filter (where verification_status = 'rejected')::int as verification_rejected,
           count(*) filter (where created_at >= now() - interval '7 days')::int as new_last_7_days,
           count(*) filter (where created_at >= now() - interval '30 days')::int as new_last_30_days
         from public.profiles`
      ),
      dailySeries(`select created_at as ts from public.profiles`),
      dailySeries(`
        select viewed_at as ts from public.story_views
        union all
        select created_at as ts from public.goal_votes
        union all
        select created_at as ts from public.match_predictions
      `),
      // Split by season status rather than counting every fantasy_teams row: a team
      // drafted while its season is still 'draft' (not yet launched by the admin) is a
      // real squad someone built, but it is not "participation in the fantasy game" -
      // that season hasn't started, nothing has been scored yet. Conflating the two
      // is exactly the misleading-stat problem this dashboard exists to avoid.
      query<{ total: string; new_last_30_days: string; draft_total: string }>(
        `select
           count(*) filter (where fs.status in ('active', 'finished'))::int as total,
           count(*) filter (where fs.status in ('active', 'finished') and ft.created_at >= now() - interval '30 days')::int as new_last_30_days,
           count(*) filter (where fs.status = 'draft')::int as draft_total
         from public.fantasy_teams ft
         join public.fantasy_seasons fs on fs.id = ft.fantasy_season_id`
      ),
      totalWithRecent("story_views", "viewed_at"),
      totalWithRecent("story_likes", "created_at"),
      totalWithRecent("goal_votes", "created_at"),
      totalWithRecent("match_predictions", "created_at"),
      query<{ news_total: string; news_published: string; stories_total: string; goal_polls_total: string }>(
        `select
           (select count(*) from public.news_posts)::int as news_total,
           (select count(*) from public.news_posts where is_published)::int as news_published,
           (select count(*) from public.stories)::int as stories_total,
           (select count(*) from public.goal_polls)::int as goal_polls_total`
      ),
      query<{ status: string; n: string }>(`select status, count(*)::int as n from public.verification_requests group by status`),
      query<{ last_7_days: string; last_30_days: string }>(
        `select
           count(*) filter (where created_at >= now() - interval '7 days')::int as last_7_days,
           count(*) filter (where created_at >= now() - interval '30 days')::int as last_30_days
         from public.audit_logs`
      ),
      query<{ total: string; new_last_30_days: string; total_memberships: string }>(
        `select
           (select count(*) from public.fantasy_mini_leagues)::int as total,
           (select count(*) from public.fantasy_mini_leagues where created_at >= now() - interval '30 days')::int as new_last_30_days,
           (select count(*) from public.fantasy_mini_league_members)::int as total_memberships`
      ),
      query<MiniLeagueAdminRow>(
        `select fml.id, fml.name, fml.invite_code, fml.created_at,
                fs.name as season_name, p.display_name as creator_name,
                count(m.id)::int as member_count
         from public.fantasy_mini_leagues fml
         join public.fantasy_seasons fs on fs.id = fml.fantasy_season_id
         join public.profiles p on p.id = fml.creator_user_id
         left join public.fantasy_mini_league_members m on m.fantasy_mini_league_id = fml.id
         group by fml.id, fs.name, p.display_name
         order by fml.created_at desc
         limit 200`
      )
    ]);

  const usersRow = users.rows[0];
  const fantasyRow = fantasy.rows[0];
  const contentRow = content.rows[0];
  const verificationCounts = Object.fromEntries(verification.rows.map((row) => [row.status, Number(row.n)]));
  const adminActivityRow = adminActivity.rows[0];
  const miniLeagueSummaryRow = miniLeagueSummary.rows[0];

  return {
    users: {
      total: Number(usersRow.total),
      fans: Number(usersRow.fans),
      verifiedPlayers: Number(usersRow.verified_players),
      admins: Number(usersRow.admins),
      newLast7Days: Number(usersRow.new_last_7_days),
      newLast30Days: Number(usersRow.new_last_30_days)
    },
    registrationsPerDay,
    activityPerDay,
    fantasy: {
      totalTeams: Number(fantasyRow.total),
      newLast30Days: Number(fantasyRow.new_last_30_days),
      draftTeams: Number(fantasyRow.draft_total)
    },
    engagement: {
      storyViews,
      storyLikes,
      goalVotes,
      matchPredictions
    },
    content: {
      newsTotal: Number(contentRow.news_total),
      newsPublished: Number(contentRow.news_published),
      storiesTotal: Number(contentRow.stories_total),
      goalPollsTotal: Number(contentRow.goal_polls_total)
    },
    verification: {
      none: verificationCounts.none || 0,
      pending: verificationCounts.pending || 0,
      approved: verificationCounts.approved || 0,
      rejected: verificationCounts.rejected || 0
    },
    adminActivity: {
      last7Days: Number(adminActivityRow.last_7_days),
      last30Days: Number(adminActivityRow.last_30_days)
    },
    miniLeagues: {
      total: Number(miniLeagueSummaryRow.total),
      newLast30Days: Number(miniLeagueSummaryRow.new_last_30_days),
      totalMemberships: Number(miniLeagueSummaryRow.total_memberships),
      list: miniLeagueList.rows.map((row) => ({
        id: row.id,
        name: row.name,
        inviteCode: row.invite_code,
        createdAt: row.created_at,
        seasonName: row.season_name,
        creatorName: row.creator_name,
        memberCount: Number(row.member_count)
      }))
    }
  };
}
