import { Ellipsis } from 'lucide-react'
import { Button as AriaButton, MenuTrigger } from 'react-aria-components'
import { Menu, MenuItem } from '../ui/overlay'
import type { NavItem } from './Shell'

/** The phone tab bar's last cell: pages that don't fit on the bar. */
export default function MoreMenu({ items, className }: { items: NavItem[]; className: string }) {
  return (
    <MenuTrigger>
      <AriaButton className={`${className} cursor-default`}>
        <Ellipsis />
        More
      </AriaButton>
      <Menu aria-label="More pages" placement="top end">
        {items.map(({ to, label, icon: Icon }) => (
          <MenuItem key={to} id={to} href={to}>
            <Icon />
            {label}
          </MenuItem>
        ))}
      </Menu>
    </MenuTrigger>
  )
}
