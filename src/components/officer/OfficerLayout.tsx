import React, { useState } from 'react';
import { OfficerHome } from './OfficerHome';
import { OfficerHistory } from './OfficerHistory';
import { OfficerProfile } from './OfficerProfile';
import { Home, History, User } from 'lucide-react';

type OfficerTab = 'home' | 'history' | 'profile';

export const OfficerLayout: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<OfficerTab>('home');

  return (
    <div className="min-h-screen bg-stone-100/60 pb-16">
      {/* Active Tab Screen */}
      <main className="w-full">
        {currentTab === 'home' && <OfficerHome />}
        {currentTab === 'history' && <OfficerHistory />}
        {currentTab === 'profile' && <OfficerProfile />}
      </main>

      {/* Fixed Mobile Bottom Navigation Bar (Exactly 3 tabs: Home, History, Profile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/90 shadow-lg">
        <div className="max-w-md mx-auto h-16 px-4 grid grid-cols-3 items-center">
          {/* Tab 1: Home */}
          <button
            id="officer-tab-home"
            onClick={() => setCurrentTab('home')}
            className={`flex flex-col items-center justify-center h-full py-1 transition ${
              currentTab === 'home'
                ? 'text-orange-600 font-bold'
                : 'text-stone-400 hover:text-stone-600 font-medium'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${currentTab === 'home' ? 'bg-orange-50' : ''}`}>
              <Home className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">Home</span>
          </button>

          {/* Tab 2: History */}
          <button
            id="officer-tab-history"
            onClick={() => setCurrentTab('history')}
            className={`flex flex-col items-center justify-center h-full py-1 transition ${
              currentTab === 'history'
                ? 'text-orange-600 font-bold'
                : 'text-stone-400 hover:text-stone-600 font-medium'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${currentTab === 'history' ? 'bg-orange-50' : ''}`}>
              <History className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">History</span>
          </button>

          {/* Tab 3: Profile */}
          <button
            id="officer-tab-profile"
            onClick={() => setCurrentTab('profile')}
            className={`flex flex-col items-center justify-center h-full py-1 transition ${
              currentTab === 'profile'
                ? 'text-orange-600 font-bold'
                : 'text-stone-400 hover:text-stone-600 font-medium'
            }`}
          >
            <div className={`p-1 rounded-xl transition ${currentTab === 'profile' ? 'bg-orange-50' : ''}`}>
              <User className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight mt-0.5">Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
};
