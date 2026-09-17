import React, { useState } from 'react';
import { ManagerDashboard } from './ManagerDashboard';
import { ManagerOccurrences } from './ManagerOccurrences';
import { ManagerOfficers } from './ManagerOfficers';
import { LayoutDashboard, ShieldAlert, Users } from 'lucide-react';

type ManagerTab = 'dashboard' | 'occurrences' | 'officers';

export const ManagerLayout: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ManagerTab>('dashboard');

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Secondary Top Navigation Tab bar */}
      <div className="bg-white border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-6 overflow-x-auto" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`py-4 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition ${
                activeTab === 'dashboard'
                  ? 'border-orange-600 text-orange-600 font-bold'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Operations Dashboard</span>
            </button>

            <button
              onClick={() => setActiveTab('occurrences')}
              className={`py-4 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition ${
                activeTab === 'occurrences'
                  ? 'border-orange-600 text-orange-600 font-bold'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>Station Occurrences</span>
            </button>

            <button
              onClick={() => setActiveTab('officers')}
              className={`py-4 px-1 inline-flex items-center gap-2 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap transition ${
                activeTab === 'officers'
                  ? 'border-orange-600 text-orange-600 font-bold'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Assigned Officers</span>
            </button>
          </nav>
        </div>
      </div>

      <main className="pb-16">
        {activeTab === 'dashboard' && <ManagerDashboard />}
        {activeTab === 'occurrences' && <ManagerOccurrences />}
        {activeTab === 'officers' && <ManagerOfficers />}
      </main>
    </div>
  );
};
