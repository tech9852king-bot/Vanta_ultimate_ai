import React, { useEffect, useState } from 'react';
import { ShieldCheck, Building2, ArrowRight } from 'lucide-react';
import { vantaApi } from '../api/client';
import type { IndustrySector, UserSession } from '../core/types';

const SECTORS: IndustrySector[] = [
  'Manufacturing & Industrial Production',
  'Energy & Power Infrastructure',
  'Airports & Transportation',
  'Hospitals & Healthcare Infrastructure',
  'Data Centers',
  'Commercial Buildings & Campuses',
  'Logistics & Supply Chain',
  'Smart Infrastructure',
];

const DEMO_PERSONAS = [
  {
    label: 'Elena Vance · Operations Manager',
    tenant: 'Apex Industrial & Grid Corp',
    email: 'ops.manager@apex-industrial.io',
    scope: 'Full Plant, Substation, DC-01 & Approvals',
  },
  {
    label: 'Marcus Chen · Platform Administrator',
    tenant: 'Apex Industrial & Grid Corp',
    email: 'admin@apex-industrial.io',
    scope: 'Global Governance, Backups & System Admin',
  },
  {
    label: 'Dr. Priya Nair · Infrastructure Engineer',
    tenant: 'Apex Industrial & Grid Corp',
    email: 'engineer@apex-industrial.io',
    scope: 'Scoped Facilities Only (No Warehouse West)',
  },
  {
    label: 'Audit Observer · Viewer (Read-Only)',
    tenant: 'Apex Industrial & Grid Corp',
    email: 'viewer@apex-industrial.io',
    scope: 'Facility A Read-Only (RBAC verified)',
  },
  {
    label: 'David Kowalski · Facility Administrator',
    tenant: 'Meridian Healthcare & Campus',
    email: 'facility.admin@meridian-infra.io',
    scope: 'Isolated Tenant 2 (Zero Apex visibility)',
  },
];

export function AuthPortal({
  onAuthenticated,
}: {
  onAuthenticated: (user: UserSession) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [allowDemoAuth, setAllowDemoAuth] = useState<boolean>(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [industry, setIndustry] = useState<IndustrySector>('Manufacturing & Industrial Production');
  const [region, setRegion] = useState('US-West');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    vantaApi
      .getAuthConfig()
      .then((cfg) => {
        if (!active) return;
        setAllowDemoAuth(cfg.allowDemoAuth);
        if (cfg.allowDemoAuth) {
          setEmail('ops.manager@apex-industrial.io');
          setPassword('VantaDemo!2026');
        }
      })
      .catch(() => {
        if (active) setAllowDemoAuth(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await vantaApi.login(email, password);
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async (demoEmail: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await vantaApi.login(demoEmail, 'VantaDemo!2026');
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign-in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await vantaApi.registerOrganization({
        organizationName: orgName,
        industry,
        region,
        fullName,
        email,
        password,
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Organization registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-[#E6EDF5] flex flex-col justify-center px-4 py-12">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-5 flex flex-col justify-between bg-[#111827] border border-[#1E293B] rounded-lg p-7">
          <div className="space-y-4">
            <div className="text-xs font-mono text-sky-400 tracking-wider">
              UNIVERSAL INFRASTRUCTURE INTELLIGENCE OS
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white text-balance">
              VANTA AI
            </h1>
            <p className="text-sm text-slate-300 leading-relaxed">
              Unified operational intelligence connecting physical facilities, industrial telemetry,
              visual inspection, Digital Twins, predictive maintenance, and human-authorized
              multi-agent orchestration.
            </p>
          </div>

          {allowDemoAuth ? (
            <div className="space-y-3 pt-6 border-t border-[#1E293B] mt-6">
              <div className="text-xs font-medium text-slate-300">
                Development Verification Personas
              </div>
              <div className="space-y-2">
                {DEMO_PERSONAS.map((persona) => (
                  <button
                    key={persona.email}
                    type="button"
                    disabled={loading}
                    onClick={() => handleQuickDemo(persona.email)}
                    className="w-full text-left px-3.5 py-2.5 rounded-md bg-[#0B0F17] border border-[#1E293B] hover:border-sky-500/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-100">{persona.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                      {persona.tenant} · {persona.scope}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="pt-6 border-t border-[#1E293B] mt-6 space-y-2 text-xs text-slate-400">
              <div className="font-mono text-emerald-400">ZERO-TRUST PRODUCTION AUTHENTICATION</div>
              <p>
                Demo persona shortcuts are disabled in production mode. Sign in with provisioned
                enterprise credentials or register a new isolated organization tenant.
              </p>
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-[#111827] border border-[#1E293B] rounded-lg p-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-[#1E293B] pb-4 mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 bg-[#0B0F17]'
                }`}
              >
                Operator Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setEmail('');
                  setPassword('');
                  setError(null);
                }}
                className={`px-4 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 bg-[#0B0F17]'
                }`}
              >
                Register New Organization
              </button>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-5 px-4 py-3 rounded-md bg-rose-950/50 border border-rose-800/70 text-xs text-rose-200"
              >
                {error}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Enterprise Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                    placeholder="operator@organization.io"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-sm font-medium text-white transition-colors"
                >
                  {loading ? 'Authenticating Session...' : 'Sign In to VANTA Workspace'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-org" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Organization Name
                    </label>
                    <input
                      id="reg-org"
                      type="text"
                      required
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Nordic Grid Infrastructure"
                      className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-region" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Deployment Region
                    </label>
                    <input
                      id="reg-region"
                      type="text"
                      required
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-sector" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Primary Infrastructure Sector
                  </label>
                  <select
                    id="reg-sector"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value as IndustrySector)}
                    className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                  >
                    {SECTORS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Administrator Full Name
                    </label>
                    <input
                      id="reg-name"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Alexei Petrov"
                      className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-medium text-slate-300 mb-1.5">
                      Administrator Email
                    </label>
                    <input
                      id="reg-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@nordicgrid.io"
                      className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="reg-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                    Password (minimum 8 characters)
                  </label>
                  <input
                    id="reg-password"
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-sm font-medium text-white transition-colors"
                >
                  {loading ? 'Provisioning Isolated Tenant...' : 'Create Organization & Sign In'}
                </button>
              </form>
            )}
          </div>

          <div className="pt-5 mt-6 border-t border-[#1E293B] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Server-enforced RBAC, facility isolation & revocation
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-sky-400" />
              8 industrial sectors supported
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
