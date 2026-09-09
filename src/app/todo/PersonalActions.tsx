// Edit and Delete for a personal to-do row (the To Do page and the calendar day panel).
import { useState } from 'react'
import type { TodoItem } from '../../domain/todo'
import { Button } from '../../ui/button'
import { deletePersonalTodo } from '../actions'
import { TodoEditor } from './TodoEditor'

export function PersonalActions({ item }: { item: TodoItem }) {
  const [editing, setEditing] = useState(false)
  return (
    <>
      <div className="flex shrink-0 gap-1">
        <Button variant="quiet" className="h-8" aria-label={`Edit ${item.title}`} onPress={() => setEditing(true)}>
          Edit
        </Button>
        <Button variant="quiet" className="h-8" aria-label={`Delete ${item.title}`} onPress={() => void deletePersonalTodo(item.id, item.title)}>
          Delete
        </Button>
      </div>
      <TodoEditor isOpen={editing} onClose={() => setEditing(false)} edit={{ id: item.id, title: item.title, ...item.todo }} />
    </>
  )
}
