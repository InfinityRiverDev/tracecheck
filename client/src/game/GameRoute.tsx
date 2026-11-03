import { useDispatch, useSelector } from 'react-redux'
import { navigate, type RouteName } from '../router'
import { markFindingFound, toggleClue, toggleEdit } from '../state/gameSlice'
import type { AppDispatch, RootState } from '../store'
import { Game, type GameProps } from './Game'

const routes: Record<Parameters<GameProps['navigate']>[0], RouteName> = {
  '/case': 'case',
  '/case/dossier': 'dossier',
  '/case/edit': 'edit',
  '/checkup': 'checkup',
}

export function GameRoute({ screen }: { screen: GameProps['screen'] }) {
  const dispatch = useDispatch<AppDispatch>()
  const { selectedClues, activeEdits } = useSelector((state: RootState) => state.game)

  return <Game
    screen={screen}
    selected={selectedClues}
    edits={activeEdits}
    onToggleClue={id => dispatch(toggleClue(id))}
    onToggleEdit={id => dispatch(toggleEdit(id))}
    onFindingFound={id => dispatch(markFindingFound(id))}
    navigate={path => navigate(routes[path])}
  />
}
