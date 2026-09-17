import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  User,
  Shield,
  Building,
  MapPin,
  UserCheck,
  Phone,
  Mail,
  LogOut,
  BadgeCheck,
} from 'lucide-react';

export const OfficerProfile: React.FC = () => {
  const { user, profile, assignedStation, signOut } = useAuth();

  return (
    <div className="max-w-md mx-auto py-5 px-4 space-y-4 pb-24 animate-fade-in">
      <div className="bg-white rounded-3xl border border-stone-200/90 p-6 shadow-xs text-center">
        {/* Avatar */}
        <div className="w-20 h-20 rounded-3xl bg-orange-600 text-white flex items-center justify-center font-bold text-2xl mx-auto shadow-md shadow-orange-600/25 mb-4">
          {profile?.full_name?.charAt(0) || <User className="w-10 h-10" />}
        </div>

        <h2 className="text-lg font-bold text-stone-900">{profile?.full_name || 'Security Officer'}</h2>
        <p className="text-xs text-stone-500 font-medium mt-0.5">{profile?.email || user?.email}</p>

        <div className="mt-3 flex items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Active Officer</span>
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <span>ID: {profile?.staff_id || 'OFFICER-SEC'}</span>
          </span>
        </div>
      </div>

      {/* Assignment Card */}
      <div className="bg-white rounded-3xl border border-stone-200/90 p-5 shadow-xs space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
          <Building className="w-3.5 h-3.5 text-orange-600" />
          <span>Station Assignment</span>
        </h3>

        {assignedStation ? (
          <div className="space-y-3">
            <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200/60 space-y-2 text-xs">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-bold text-stone-900 text-sm">{assignedStation.station_name}</div>
                  <div className="text-stone-500">{assignedStation.station_code}</div>
                </div>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  ASSIGNED
                </span>
              </div>

              <div className="flex items-center gap-2 text-stone-600 pt-1 border-t border-stone-200/50">
                <MapPin className="w-3.5 h-3.5 text-orange-600 flex-shrink-0" />
                <span>{assignedStation.location}</span>
              </div>
            </div>

            {/* Manager Contact */}
            <div className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-200/60 space-y-2 text-xs">
              <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-orange-600" />
                <span>Station Manager</span>
              </div>
              <div className="text-stone-700 font-medium">
                {assignedStation.manager?.full_name || 'Station Manager'}
              </div>
              <div className="flex flex-col gap-1 text-[11px] text-stone-500">
                {assignedStation.manager?.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-orange-600" />
                    <span>{assignedStation.manager.email}</span>
                  </div>
                )}
                {assignedStation.manager?.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-orange-600" />
                    <span>{assignedStation.manager.phone}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-center text-xs text-stone-500">
            No station currently assigned. Please report to security administration.
          </div>
        )}
      </div>

      {/* Account Actions */}
      <div className="bg-white rounded-3xl border border-stone-200/90 p-4 shadow-xs">
        <button
          onClick={() => signOut()}
          className="w-full py-3 px-4 rounded-2xl bg-stone-50 hover:bg-rose-50 text-stone-700 hover:text-rose-700 font-semibold text-xs border border-stone-200 hover:border-rose-200 transition flex items-center justify-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out of Officer Terminal</span>
        </button>
      </div>
    </div>
  );
};
