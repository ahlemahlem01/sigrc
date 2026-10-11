import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
    archiveDepartment,
    createDepartment,
    getDepartments,
    updateDepartment
} from '../../services/actionPlanService';

interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  organizationId: string;
  createdAt: string;
}

const DepartmentList = () => {
  const { accessToken } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState({
    name: '', code: '', description: '', organizationId: ''
  });

  const loadDepartments = async () => {
    try {
      const res = await getDepartments(accessToken!);
      setDepartments(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the listed values change
  useEffect(() => { loadDepartments(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', code: '', description: '', organizationId: '' });
    setShowModal(true);
  };

  const openEdit = (dept: Department) => {
    setEditing(dept);
    setForm({ name: dept.name, code: dept.code, description: dept.description || '', organizationId: dept.organizationId });
    setShowModal(true);
  };

  const handleSubmit = async () => {
    try {
      if (editing) {
        await updateDepartment(accessToken!, editing.id, form);
      } else {
        await createDepartment(accessToken!, form);
      }
      setShowModal(false);
      loadDepartments();
    } catch (e) {
      console.error(e);
    }
  };

  const handleArchive = async (id: string) => {
    if (!window.confirm('Archive this department?')) return;
    await archiveDepartment(accessToken!, id);
    loadDepartments();
  };

  if (loading) return <p className="p-6">Loading...</p>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Departments</h1>
        <button
          onClick={openCreate}
          className="bg-red-700 text-white px-4 py-2 rounded-lg hover:bg-red-800"
        >
          + New Department
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-6 py-3 text-left">Name</th>
              <th className="px-6 py-3 text-left">Code</th>
              <th className="px-6 py-3 text-left">Description</th>
              <th className="px-6 py-3 text-left">Created</th>
              <th className="px-6 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {departments.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                  No departments found
                </td>
              </tr>
            ) : departments.map(dept => (
              <tr key={dept.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium">{dept.name}</td>
                <td className="px-6 py-4 text-gray-500">{dept.code}</td>
                <td className="px-6 py-4 text-gray-500">{dept.description || '—'}</td>
                <td className="px-6 py-4 text-gray-500">
                  {new Date(dept.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 flex gap-2">
                  <button
                    onClick={() => openEdit(dept)}
                    className="text-blue-600 hover:underline text-xs"
                  >Edit</button>
                  <button
                    onClick={() => handleArchive(dept.id)}
                    className="text-red-600 hover:underline text-xs"
                  >Archive</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-bold mb-4">
              {editing ? 'Edit Department' : 'New Department'}
            </h2>
            <div className="space-y-3">
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Code"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value })}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Description (optional)"
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
              {!editing && (
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Organization ID"
                  value={form.organizationId}
                  onChange={e => setForm({ ...form, organizationId: e.target.value })}
                />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >Cancel</button>
              <button
                onClick={handleSubmit}
                className="px-4 py-2 text-sm bg-red-700 text-white rounded-lg hover:bg-red-800"
              >
                {editing ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepartmentList;