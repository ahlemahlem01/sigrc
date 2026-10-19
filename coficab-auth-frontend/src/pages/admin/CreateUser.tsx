// src/pages/admin/CreateUser.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { createUser, getPermissions, getUsers } from '../../services/adminService';
import { permissionTitle } from '../../utils/permissionLanguage';
import { adminEmployeeService } from '../../services/adminEmployeeService';
import OrganizationDepartmentFields, { type OrgDeptValue } from '../../components/OrganizationDepartmentFields';

const CreateUser = () => {
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [orgDept, setOrgDept] = useState<OrgDeptValue>({ organizationId: '', departmentId: '', departmentName: '' });
  const [poste, setPoste] = useState('');
  const [equipe, setEquipe] = useState('');
  const [ligneProduction, setLigneProduction] = useState('');
  const [telephone, setTelephone] = useState('');
  const [role, setRole] = useState('user');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<{ key: string; label: string }[]>([]);
  const [permissionsError, setPermissionsError] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getPermissions(accessToken)
      .then((rows) => {
        if (cancelled) return;
        setCatalog(
          (rows as any[]).map((row) => ({
            key: String(row.name ?? row.Name ?? ''),
            label: permissionTitle(String(row.name ?? row.Name ?? ''), String(row.displayName ?? row.DisplayName ?? '')),
          })).filter((row) => row.key)
        );
      })
      .catch(() => {
        if (!cancelled) setPermissionsError('Impossible de charger les permissions.');
      });
    return () => { cancelled = true; };
  }, [accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!poste.trim() || !equipe.trim()) {
        setError('Le poste et l\'équipe sont obligatoires.');
        setLoading(false);
        return;
      }
      if (!orgDept.organizationId || !orgDept.departmentId) {
        setError("Un utilisateur doit appartenir à une organisation et à l'un de ses départements.");
        setLoading(false);
        return;
      }
      await createUser(accessToken!, {
        fullName,
        email,
        department: orgDept.departmentName,
        departmentId: orgDept.departmentId,
        organizationId: orgDept.organizationId,
        role,
        permissions: selectedPermissions,
      });
      const users = await getUsers(accessToken!);
      const created = users.find((u) => u.email?.toLowerCase() === email.trim().toLowerCase());
      if (created?.id) {
        await adminEmployeeService.updateProfile(accessToken!, created.id, {
          name: fullName.trim(),
          email: email.trim(),
          role,
          poste: poste.trim(),
          equipe: equipe.trim(),
          ligneProduction: ligneProduction.trim() || null,
          telephone: telephone.trim() || null,
          status: 'active',
        });
      }
      navigate('/admin');
    } catch (err: any) {
      setError(err.response?.data || 'Erreur lors de la création de l\'utilisateur');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const togglePermission = (perm: string) =>
    setSelectedPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Créer un utilisateur</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nom complet <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Prénom Nom"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="email@coficab.com"
            required
          />
        </div>

        <OrganizationDepartmentFields
          value={orgDept}
          onChange={setOrgDept}
          classes={{ field: '', label: 'block text-sm font-medium text-gray-700 mb-1', input: 'w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500' }}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Poste <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={poste}
            onChange={(e) => setPoste(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Opérateur, Technicien qualité…"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Équipe <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={equipe}
            onChange={(e) => setEquipe(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Équipe Production A…"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ligne de production</label>
          <input
            type="text"
            value={ligneProduction}
            onChange={(e) => setLigneProduction(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ligne 1…"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone</label>
          <input
            type="text"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="+216 70 123 456"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rôle <span className="text-red-500">*</span>
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
            <option value="superadmin">Superadmin</option>
          </select>
        </div>

        {/* Password field removed — backend generates a secure password and emails it */}
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          Un mot de passe temporaire sera généré automatiquement et envoyé à l'adresse email renseignée.
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
          {permissionsError && <p className="text-sm text-red-600 mb-2">{permissionsError}</p>}
          <div className="space-y-2">
            {catalog.map(({ key, label }) => {
              const guaranteed = key === 'data:import' && (role === 'admin' || role === 'superadmin');
              const checked = guaranteed || selectedPermissions.includes(key);
              return (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={guaranteed}
                  onChange={() => { if (!guaranteed) togglePermission(key); }}
                />
                {label}{guaranteed ? ' (garanti pour ce rôle)' : ''}
              </label>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm bg-red-700 text-white rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Création...' : 'Créer'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateUser;