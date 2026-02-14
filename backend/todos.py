# backend/todos.py
# ProTodo v1.4 - Subtasks & Checklist

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Todo
from datetime import datetime, timezone, timedelta

todos_bp = Blueprint('todos', __name__)

# =========================================================
# 1. HELPER FUNCTIONS
# =========================================================

def parse_due_date(date_str):
    if not date_str or date_str == "": return None
    try:
        dt = datetime.fromisoformat(date_str)
        if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError: return None

def todo_to_dict(todo):
    return {
        "id": todo.id,
        "title": todo.title,
        "due_date": todo.due_date.isoformat() if todo.due_date else None,
        "priority": todo.priority,
        "category": todo.category,
        "tags": todo.tags,
        "notes": todo.notes,
        "completed": todo.completed,
        "reminder_minutes": todo.reminder_minutes,
        "recurrence": todo.recurrence,
        
        # === THIS LINE IS CRITICAL FOR SUBTASKS ===
        "subtasks": todo.subtasks or [], 
        # ==========================================
        
        "created_at": todo.created_at.isoformat()
    }

# =========================================================
# 2. API ROUTES
# =========================================================

@todos_bp.route('/todos', methods=['GET'])
@jwt_required()
def get_todos():
    try:
        user_id = int(get_jwt_identity())
        todos = Todo.query.filter_by(user_id=user_id).order_by(Todo.created_at.desc()).all()
        output = [todo_to_dict(t) for t in todos]
        return jsonify(output), 200
    except Exception as e:
        print(f"Error fetching todos: {e}")
        return jsonify({"message": "Error fetching data"}), 500

@todos_bp.route('/todos', methods=['POST'])
@jwt_required()
def create_todo():
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()

        if not data.get('title'):
            return jsonify({"message": "Title is required"}), 400

        new_todo = Todo(
            title=data['title'],
            due_date=parse_due_date(data.get('due_date')),
            priority=data.get('priority', 'medium'),
            category=data.get('category', 'other'),
            tags=data.get('tags', []),
            notes=data.get('notes', ''),
            completed=False,
            reminder_sent=False,
            reminder_minutes=int(data.get('reminder_minutes', 30)),
            recurrence=data.get('recurrence', 'never'),
            
            # === SAVE SUBTASKS ===
            subtasks=data.get('subtasks', []), 
            
            user_id=user_id
        )

        db.session.add(new_todo)
        db.session.commit()

        return jsonify(todo_to_dict(new_todo)), 201
    except Exception as e:
        db.session.rollback()
        print(f"Error creating todo: {e}")
        return jsonify({"message": "Failed to create task"}), 500

@todos_bp.route('/todos/<int:id>', methods=['PUT'])
@jwt_required()
def update_todo(id):
    try:
        user_id = int(get_jwt_identity())
        todo = Todo.query.filter_by(id=id, user_id=user_id).first()
        
        if not todo:
            return jsonify({"message": "Todo not found"}), 404

        data = request.get_json()

        # Recurring Logic
        if 'completed' in data and data['completed'] == True:
            if not todo.completed and todo.recurrence != 'never' and todo.due_date:
                next_date = None
                if todo.recurrence == 'daily':
                    next_date = todo.due_date + timedelta(days=1)
                elif todo.recurrence == 'weekly':
                    next_date = todo.due_date + timedelta(weeks=1)
                elif todo.recurrence == 'monthly':
                    next_date = todo.due_date + timedelta(days=30)
                
                if next_date:
                    next_task = Todo(
                        user_id=user_id,
                        title=todo.title,
                        notes=todo.notes,
                        priority=todo.priority,
                        category=todo.category,
                        tags=todo.tags,
                        recurrence=todo.recurrence,
                        reminder_minutes=todo.reminder_minutes,
                        due_date=next_date,
                        completed=False,
                        reminder_sent=False,
                        subtasks=todo.subtasks 
                    )
                    db.session.add(next_task)
                    print(f"🔄 Recurring Task Created: {todo.title}")

        # Standard Updates
        if 'title' in data: todo.title = data['title']
        if 'completed' in data: todo.completed = data['completed']
        if 'priority' in data: todo.priority = data['priority']
        if 'category' in data: todo.category = data['category']
        if 'tags' in data: todo.tags = data['tags']
        if 'notes' in data: todo.notes = data['notes']
        if 'reminder_minutes' in data: todo.reminder_minutes = int(data['reminder_minutes'])
        if 'recurrence' in data: todo.recurrence = data['recurrence']
        
        # === UPDATE SUBTASKS ===
        if 'subtasks' in data: todo.subtasks = data['subtasks']

        if 'due_date' in data:
            todo.due_date = parse_due_date(data['due_date'])
            todo.reminder_sent = False 

        db.session.commit()
        return jsonify({"message": "Todo updated successfully"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Error updating todo: {e}")
        return jsonify({"message": "Update failed"}), 500

@todos_bp.route('/todos/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_todo(id):
    try:
        user_id = int(get_jwt_identity())
        todo = Todo.query.filter_by(id=id, user_id=user_id).first()
        if not todo: return jsonify({"message": "Todo not found"}), 404
        db.session.delete(todo)
        db.session.commit()
        return jsonify({"message": "Deleted successfully"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"message": "Delete failed"}), 500

@todos_bp.route('/todos/bulk', methods=['DELETE'])
@jwt_required()
def delete_bulk_todos():
    try:
        user_id = int(get_jwt_identity())
        data = request.get_json()
        ids_to_delete = data.get('ids', [])
        if not ids_to_delete: return jsonify({"message": "No IDs provided"}), 400

        delete_count = Todo.query.filter(
            Todo.id.in_(ids_to_delete), 
            Todo.user_id == user_id
        ).delete(synchronize_session=False)

        db.session.commit()
        return jsonify({"message": f"Deleted {delete_count} todos"}), 200
    except Exception as e:
        db.session.rollback()
        print(f"Bulk delete error: {e}")
        return jsonify({"message": "Bulk delete failed"}), 500