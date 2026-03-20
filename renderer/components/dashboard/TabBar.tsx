type SessionTab = 'overview' | 'ai' | 'transcript';

interface TabBarProps {
  activeTab: SessionTab;
  onChange: (tab: SessionTab) => void;
}

export default function TabBar({ activeTab, onChange }: TabBarProps) {
  return (
    <div className="dashboard-tabbar">
      <button
        type="button"
        className={activeTab === 'overview' ? 'dashboard-tab dashboard-tab-active' : 'dashboard-tab'}
        onClick={() => onChange('overview')}
      >
        Overview
      </button>
      <button
        type="button"
        className={activeTab === 'ai' ? 'dashboard-tab dashboard-tab-active' : 'dashboard-tab'}
        onClick={() => onChange('ai')}
      >
        AI synopses
      </button>
      <button
        type="button"
        className={activeTab === 'transcript' ? 'dashboard-tab dashboard-tab-active' : 'dashboard-tab'}
        onClick={() => onChange('transcript')}
      >
        Transcript
      </button>
    </div>
  );
}
