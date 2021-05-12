/*

List of flags and their descriptions:

authentic: Ignores a target's substitute.
bite: Power is multiplied by 1.5 when used by a Pokemon with the Strong Jaw Ability.
bullet: Has no effect on Pokemon with the Bulletproof Ability.
charge: The user is unable to make a move between turns.
contact: Makes contact.
dance: When used by a Pokemon, other Pokemon with the Dancer Ability can attempt to execute the same move.
defrost: Thaws the user if executed successfully while the user is frozen.
distance: Can target a Pokemon positioned anywhere in a Triple Battle.
gravity: Prevented from being executed or selected during Gravity's effect.
heal: Prevented from being executed or selected during Heal Block's effect.
mirror: Can be copied by Mirror Move.
mystery: Unknown effect.
nonsky: Prevented from being executed or selected in a Sky Battle.
powder: Has no effect on Grass-type Pokemon, Pokemon with the Overcoat Ability, and Pokemon holding Safety Goggles.
protect: Blocked by Detect, Protect, Spiky Shield, and if not a Status move, King's Shield.
pulse: Power is multiplied by 1.5 when used by a Pokemon with the Mega Launcher Ability.
punch: Power is multiplied by 1.2 when used by a Pokemon with the Iron Fist Ability.
recharge: If this move is successful, the user must recharge on the following turn and cannot make a move.
reflectable: Bounced back to the original user by Magic Coat or the Magic Bounce Ability.
snatch: Can be stolen from the original user and instead used by another Pokemon using Snatch.
sound: Has no effect on Pokemon with the Soundproof Ability.

*/

export const Moves: {[moveid: string]: MoveData} = {
	burningjealousy: {
		num: 807,
		accuracy: 100,
		basePower: 80,
		category: "Special",
		shortDesc: "Raises user's Sp. Atk. by 1 when target had a stat rise this turn.",
		name: "Burning Jealousy",
		pp: 10,
		priority: 0,
		flags: {protect: 1, mirror: 1},
		secondary: {
			chance: 100,
			onHit(target, source, move, pokemon) {
				if (target?.statsRaisedThisTurn) {
					this.boost({spa: 1}, pokemon);
				}
			},
		},
		target: "allAdjacentFoes",
		type: "Fire",
		contestType: "Tough",
	},
	/*corrosivegas: {
		num: 810,
		accuracy: 95,
		basePower: 0,
		category: "Status",
		name: "Corrosive Gas",
		pp: 40,
		priority: 0,
		flags: {protect: 1, reflectable: 1, mirror: 1, mystery: 1},
		onHit(target, source, move) {
			const item = target.takeItem(source);
			if (item) {
				this.add('-enditem', target, item.name, '[from] move: Corrosive Gas', '[of] ' + source && target.addVolatile('corrosed'));
			}
		},
		secondary: null,
		target: "allAdjacent",
		type: "Poison",
	},*/
	decorate: {
		num: 777,
		accuracy: 100,
		basePower: 0,
		category: "Status",
		shortDesc: "Uses heals HP=target's Spe stat. Lowers Spe by 1.",
		name: "Decorate",
		pp: 10,
		priority: 0,
		flags: {protect: 1, reflectable: 1, mirror: 1, heal: 1},
		onHit(target, source) {
			if (target.boosts.spe === -6) return false;
			const spe = target.getStat('spe', false, true);
			const success = this.boost({spe: -1}, target, source, null, false, true);
			return !!(this.heal(spe, source, target) || success);
		},
		secondary: null,
		target: "normal",
		type: "Fairy",
		zMove: {boost: {def: 1}},
		contestType: "Cute",
	},
	//not finished
	/*dive: {
		num: 291,
		accuracy: 100,
		basePower: 90,
		category: "Physical",
		name: "Dive",
		pp: 10,
		priority: 0,
		flags: {contact: 1, charge: 1, protect: 1, mirror: 1, nonsky: 1},
		onTryMove(attacker, defender, move) {
			if (attacker.removeVolatile(move.id)) {
				return;
			}
			if (attacker.hasAbility('gulpmissile') && attacker.species.name === 'Cramorant' && !attacker.transformed) {
				const forme = attacker.hp <= attacker.maxhp / 2 ? 'cramorantgorging' : 'cramorantgulping';
				attacker.formeChange(forme, move);
			}
			this.add('-prepare', attacker, move.name);
			if (!this.runEvent('ChargeMove', attacker, defender, move)) {
				return;
			}
			attacker.addVolatile('twoturnmove', defender);
			return null;
		},
		condition: {
			duration: 2,
			onImmunity(type, pokemon) {
				if (type === 'sandstorm' || type === 'hail') return false;
			},
			onInvulnerability(target, source, move) {
				if (['surf', 'whirlpool'].includes(move.id)) {
					return;
				}
				return false;
			},
			onSourceModifyDamage(damage, source, target, move) {
				if (move.id === 'surf' || move.id === 'whirlpool') {
					return this.chainModify(2);
				}
			},
		},
		secondary: null,
		target: "normal",
		type: "Water",
		contestType: "Beautiful",
	},*/
	eeriespell: {
		num: 826,
		accuracy: 100,
		basePower: 80,
		category: "Special",
		shortDesc: "Torments the target.",
		name: "Eerie Spell",
		pp: 10,
		priority: 0,
		flags: {protect: 1, mirror: 1, sound: 1, authentic: 1},
		secondary: {
			chance: 100,
			onHit(target, source, move) {
				if (source.isActive) target.addVolatile('torment');
			},
		},
		target: "normal",
		type: "Psychic",
	},
	jawlock: {
		num: 746,
		accuracy: 100,
		basePower: 80,
		category: "Physical",
		shortDesc: "Each turn, target looses 1/8 max HP until either it or the user switches out.",
		name: "Jaw Lock",
		pp: 15,
		priority: 0,
		flags: {bite: 1, contact: 1, protect: 1, mirror: 1},
		volatileStatus: 'jawlock',
		secondary: null,
		target: "normal",
		type: "Rock",
	},
	rocksmash: {
		num: 249,
		accuracy: 100,
		basePower: 70,
		category: "Physical",
		shortDesc: "1.5x power when Stealth Rock are on the field. Removes Stealth Rock.",
		name: "Rock Smash",
		pp: 10,
		priority: 0,
		flags: {contact: 1, protect: 1, mirror: 1},
		onBasePower(power, user) {
		if (user.side.removeSideCondition('stealthrock')) {
			this.add('-sideend', user.side, "Stealth Rock", '[from] move: Rapid Spin', '[of] ' + user);
			return power * 1.5;
			}
		},
		secondary: null,
		target: "normal",
		type: "Fighting",
		contestType: "Tough",
	},
	skittersmack: {
		num: 806,
		accuracy: 100,
		basePower: 85,
		category: "Physical",
		shortDesc: "100% chance to lower target's Evasion by 1.",
		name: "Skitter Smack",
		pp: 20,
		priority: 0,
		flags: {contact: 1, protect: 1, mirror: 1},
		secondary: {
			chance: 100,
			boosts: {
				evasion: -1,
			},
		},
		target: "normal",
		type: "Bug",
	},
	strength: {
		num: 70,
		accuracy: 100,
		basePower: 70,
		category: "Physical",
		shortDesc: "Super effective on Rock.",
		name: "Strength",
		pp: 20,
		priority: 0,
		flags: {contact: 1, protect: 1, mirror: 1},
		onEffectiveness(typeMod, target, type) {
			if (type === 'Rock') return 1;
		},
		secondary: null,
		target: "normal",
		type: "Normal",
		contestType: "Tough",
	},
};
