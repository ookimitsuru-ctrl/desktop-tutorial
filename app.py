from datetime import datetime, timezone

from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy

CAPACITY = 3

app = Flask(__name__, static_folder='static', static_url_path='')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///parking.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)


class Vehicle(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    vehicle_number = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(10), nullable=False)  # 'parked' or 'waiting'
    slot = db.Column(db.Integer, nullable=True)
    entered_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


def serialize(vehicle):
    return {
        'id': vehicle.id,
        'vehicle_number': vehicle.vehicle_number,
        'status': vehicle.status,
        'slot': vehicle.slot,
        'entered_at': vehicle.entered_at.isoformat(),
    }


@app.route('/')
def index():
    return app.send_static_file('index.html')


@app.route('/api/status')
def status():
    parked = Vehicle.query.filter_by(status='parked').order_by(Vehicle.slot).all()
    waiting = Vehicle.query.filter_by(status='waiting').order_by(Vehicle.entered_at).all()
    return jsonify({
        'capacity': CAPACITY,
        'parked': [serialize(v) for v in parked],
        'waiting': [serialize(v) for v in waiting],
    })


@app.route('/api/enter', methods=['POST'])
def enter():
    vehicle_number = (request.get_json(silent=True) or {}).get('vehicle_number', '').strip()
    if not vehicle_number:
        return jsonify({'error': '車両番号を入力してください'}), 400

    already_here = Vehicle.query.filter(
        Vehicle.vehicle_number == vehicle_number,
        Vehicle.status.in_(['parked', 'waiting']),
    ).first()
    if already_here:
        return jsonify({'error': 'この車両番号は既に入庫または待機中です'}), 400

    occupied_slots = {v.slot for v in Vehicle.query.filter_by(status='parked').all()}
    free_slot = next((s for s in range(1, CAPACITY + 1) if s not in occupied_slots), None)

    if free_slot is not None:
        vehicle = Vehicle(vehicle_number=vehicle_number, status='parked', slot=free_slot)
        message = f'{vehicle_number} を {free_slot} 番に入庫しました'
    else:
        vehicle = Vehicle(vehicle_number=vehicle_number, status='waiting', slot=None)
        message = '満車のため、外で待機してください'

    db.session.add(vehicle)
    db.session.commit()
    return jsonify({'message': message, 'vehicle': serialize(vehicle)}), 201


@app.route('/api/exit/<int:vehicle_id>', methods=['POST'])
def exit_vehicle(vehicle_id):
    vehicle = Vehicle.query.get(vehicle_id)
    if not vehicle or vehicle.status != 'parked':
        return jsonify({'error': '駐車中の車両が見つかりません'}), 404

    freed_slot = vehicle.slot
    freed_number = vehicle.vehicle_number
    db.session.delete(vehicle)
    db.session.commit()

    message = f'{freed_number} が {freed_slot} 番から出庫しました'

    next_waiting = Vehicle.query.filter_by(status='waiting').order_by(Vehicle.entered_at).first()
    if next_waiting:
        next_waiting.status = 'parked'
        next_waiting.slot = freed_slot
        db.session.commit()
        message += f'。待機していた {next_waiting.vehicle_number} が {freed_slot} 番に繰り上がり入庫しました'

    return jsonify({'message': message})


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(debug=True)
