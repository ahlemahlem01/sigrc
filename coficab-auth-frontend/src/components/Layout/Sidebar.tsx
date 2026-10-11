import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasPermission, hasRole } = useAuth();

  const navItems = [
    { label: 'Dashboard', path: '/dashboard', always: true },
    { label: 'My Actions', path: '/my-actions', always: true },
    { label: 'Action Plans', path: '/action-plan', permission: 'action_plan:view' },
    { label: 'Departments', path: '/action-plan/departments', permission: 'action_plan:view' },
    { label: 'Maintenance', path: '/maintenance', permission: 'maintenance:view' },
    { label: 'HR', path: '/hr', permission: 'hr:view' },
    { label: 'Organizations', path: '/admin/organizations', adminOnly: true },
    { label: 'Administration', path: '/admin', adminOnly: true },
      { label: 'DepartmentsPage', path: '/admin/departments', adminOnly: true },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="w-64 min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-700">
        <h1 className="text-xl font-bold text-red-500">COFICAB</h1>
        <p className="text-xs text-gray-400 mt-1">Action Plan System</p>
      </div>

      {/* User info */}
      <div className="p-4 border-b border-gray-700">
        <p className="text-sm font-medium">{user?.name || user?.name}</p>
        <p className="text-xs text-gray-400 capitalize">{user?.department || 'No department'}</p>
        <p className="text-xs text-gray-500 mt-1">
          {hasRole('admin') || hasRole('superadmin') ? '👑 Admin' : '👤 User'}
        </p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(item => {
          // Vérifier les permissions
          if (item.adminOnly && !hasRole('admin') && !hasRole('superadmin')) return null;
          if (item.permission && !hasPermission(item.permission)) return null;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`w-full flex items-center px-4 py-2.5 rounded-lg text-sm transition-colors ${
                isActive(item.path)
                  ? 'bg-red-700 text-white'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-700">
        <button
          onClick={logout}
          className="w-full flex items-center px-4 py-2.5 rounded-lg text-sm text-gray-300 hover:bg-gray-800"
        >
          <span>🚪</span>
          <span className="ml-3">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;