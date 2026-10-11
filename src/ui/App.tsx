import { useStore } from './store';
import { Welcome } from './screens/Welcome';
import { Setup } from './screens/Setup';
import { Home } from './screens/Home';
import { SessionScreen } from './screens/Session';
import { DrillsScreen, IQScreen, MasteryScreen, RotationTrainerScreen, CoachScreen } from './screens/Modes';
import { RallyScreen, ScrimmageScreen } from './screens/Rally';
import { ExplorerScreen } from './screens/Explorer';
import { CompareScreen } from './screens/Compare';
import { DefenseScreen } from './screens/Defense';
import { LearnScreen, LessonScreen, MistakesScreen } from './screens/Learn';
import { ProgressScreen } from './screens/ProgressScreen';
import { SettingsScreen } from './screens/Settings';
import { GameSimScreen } from './screens/GameSim';

export function App() {
  const { screen, settings } = useStore();
  const motionCls = settings.motion === 'reduced' ? 'reduce-motion' : settings.motion === 'system' ? 'motion-system' : '';
  return (
    <div className={`vq-bg min-h-screen ${motionCls}`}>
      <div key={screen.name + ('key' in screen ? screen.key : '')} className="vq-fade">
        <Route />
      </div>
    </div>
  );
}

function Route() {
  const { screen } = useStore();
  switch (screen.name) {
    case 'welcome':
      return <Welcome />;
    case 'setup':
      return <Setup />;
    case 'home':
      return <Home />;
    case 'session':
      return <SessionScreen config={screen.config} />;
    case 'rotation':
      return <RotationTrainerScreen />;
    case 'mastery':
      return <MasteryScreen />;
    case 'drills':
      return <DrillsScreen />;
    case 'iq':
      return <IQScreen />;
    case 'coach':
      return <CoachScreen />;
    case 'rally':
      return <RallyScreen scripted={screen.scripted} />;
    case 'scrimmage':
      return <ScrimmageScreen />;
    case 'game':
      return <GameSimScreen />;
    case 'explorer':
      return <ExplorerScreen initialZone={screen.zone} />;
    case 'compare':
      return <CompareScreen />;
    case 'defense':
      return <DefenseScreen />;
    case 'learn':
      return <LearnScreen />;
    case 'lesson':
      return <LessonScreen id={screen.id} />;
    case 'mistakes':
      return <MistakesScreen />;
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}
