import React, { useEffect, useState } from 'react';
import {
  Users,
  ShieldAlert,
  Activity,
  Loader2,
  KeyRound,
  LogIn,
} from 'lucide-react';
import {
  adminListUsers,
  adminListActivity,
  formatAuthTimestamp,
  formatAuthError,
} from '../services/tauri/auth';
import type { ActivityView, AuthUserView } from '../services/tauri/auth';

export const AdminPanelView: React.FC = () => {
  const [users, setUsers] = useState<AuthUserView[]>([]);
  const [activity, setActivity] = useState<ActivityView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState<boolean>(
    () => localStorage.getItem('netoze_token') !== null
  );

  useEffect(() => {
    const token = localStorage.getItem('netoze_token');
    if (!token) {
      setLoading(false);
      setError('NO_LOCAL_SESSION');
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [u, a] = await Promise.all([adminListUsers(token), adminListActivity(token, 200)]);
        if (cancelled) return;
        setUsers(u);
        setActivity(a);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        const raw = err instanceof Error ? err.message : String(err);
        let code = raw;
        try {
          const parsed = JSON.parse(raw);
          code = parsed.message ?? raw;
        } catch {
          // raw string form
        }
        setError(code);
        setUsers([]);
        setActivity([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasToken]);

  const refresh = () => {
    setHasToken(localStorage.getItem('netoze_token') !== null);
  };

  const isForbidden = error === 'FORBIDDEN_ADMIN_ROLE_REQUIRED';
  const isNoSession = error === 'NO_LOCAL_SESSION';

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 font-mono text-lg font-bold tracking-widest text-cyan-300">
          <ShieldAlert className="h-5 w-5" /> ADMIN PANEL
        </h1>
        <button
          onClick={refresh}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-900"
        >
          REFRESH
        </button>
      </div>

      {isNoSession && (
        <div className="rounded-2xl border-2 border-amber-800/60 bg-amber-950/30 p-8 text-center">
          <LogIn className="mx-auto mb-3 h-10 w-10 text-amber-500" />
          <h2 className="font-mono text-sm font-bold tracking-widest text-amber-300">
            NO LOCAL SESSION
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">
            Log in with a local desktop account to query user administration. Only the first
            registered account has the ADMINISTRATOR role.
          </p>
        </div>
      )}

      {isForbidden && (
        <div className="rounded-2xl border-2 border-red-900/70 bg-red-950/30 p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <h2 className="font-mono text-sm font-bold tracking-widest text-red-300">
            ADMIN ROLE REQUIRED
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-slate-500">
            {formatAuthError('FORBIDDEN_ADMIN_ROLE_REQUIRED')} The backend rejected this
            request — this is not a UI limitation. Re-login with an admin account to
            proceed.
          </p>
        </div>
      )}

      {error && !isForbidden && !isNoSession && (
        <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {formatAuthError(error)}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Querying local auth store…
        </div>
      )}

      {!loading && !error && (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border-2 border-slate-800 bg-slate-950 p-5">
            <h2 className="mb-3 flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-slate-400">
              <Users className="h-4 w-4 text-cyan-500" /> LOCAL USER DIRECTORY
            </h2>
            {users.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-600">
                No local accounts yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Last login</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => (
                    <tr key={u.id} className="text-slate-400">
                      <td className="py-2 pr-3 font-medium text-slate-200">{u.name}</td>
                      <td className="py-2 pr-3">{u.email}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-cyan-800/40 text-cyan-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            u.status === 'active' ? 'text-emerald-400' : 'text-red-400'
                          }
                        >
                          {u.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2 whitespace-nowrap text-slate-500">
                        {formatAuthTimestamp(u.last_login_at ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="mt-3 border-t border-slate-800 pt-3 text-[11px] text-slate-600">
              Member since: {users.length > 0 ? formatAuthTimestamp(users[0].created_at) : '—'}
            </div>
          </div>

          <div className="rounded-2xl border-2 border-slate-800 bg-slate-950 p-5">
            <h2 className="mb-3 flex items-center gap-2 font-mono text-xs font-bold tracking-widest text-slate-400">
              <Activity className="h-4 w-4 text-cyan-500" /> SECURITY ACTIVITY
            </h2>
            {activity.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-600">
                No auth events recorded yet.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-950 text-[10px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-2 pr-3">When</th>
                      <th className="py-2 pr-3">Actor</th>
                      <th className="py-2 pr-3">Event</th>
                      <th className="py-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {activity.map((a) => (
                      <tr key={a.id} className="text-slate-400">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatAuthTimestamp(a.timestamp)}
                        </td>
                        <td className="py-2 pr-3">{a.actor_email}</td>
                        <td className="py-2 pr-3 font-mono text-slate-300">{a.action}</td>
                        <td className="py-2 text-slate-500">{a.detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-[11px] leading-relaxed text-slate-600">
        <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-700" />
        Data source: netoze_auth.json in the app data directory. Role checks are enforced
        in the Rust backend (FORBIDDEN_ADMIN_ROLE_REQUIRED), so the UI cannot bypass them.
      </div>
    </div>
  );
};