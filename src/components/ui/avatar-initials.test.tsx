import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AvatarInitials } from './avatar-initials'

describe('AvatarInitials', () => {
  it('renders the first two letters of a single-word name, uppercased', () => {
    render(<AvatarInitials name="cher" />)
    expect(screen.getByText('CH')).toBeTruthy()
  })

  it('renders first+last initials for a multi-word name', () => {
    render(<AvatarInitials name="Raul Medina" />)
    expect(screen.getByText('RM')).toBeTruthy()
  })

  it('renders "?" for an empty name', () => {
    render(<AvatarInitials name="" />)
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('is deterministic: the same name renders the same background color across two renders', () => {
    const { unmount } = render(<AvatarInitials name="Raul Medina" />)
    const firstColor = screen.getByText('RM').style.backgroundColor
    unmount()
    render(<AvatarInitials name="Raul Medina" />)
    const secondColor = screen.getByText('RM').style.backgroundColor
    expect(firstColor).toBe(secondColor)
    expect(firstColor).not.toBe('')
  })
})
