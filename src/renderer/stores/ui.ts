import { atom } from 'jotai'

export type LeftPanelView = 'list' | 'trashcan'

export const leftPanelViewAtom = atom<LeftPanelView>('list')
