export const Scripts: {[k: string]: ModdedBattleScriptsData} = {
	canMegaEvo(pokemon) {
		const altForme = pokemon.baseSpecies.otherFormes && this.dex.getSpecies(pokemon.baseSpecies.otherFormes[0]);
		const item = pokemon.getItem();
		if (
			altForme?.isMega && altForme?.requiredMove &&
			pokemon.baseMoves.includes(this.toID(altForme.requiredMove)) && !item.zMove
		) {
			return altForme.name;
		}
		if (item.name === "Slowbronite" && pokemon.baseSpecies.name === "Slowbro-Galar") {
			return null;
		}
		return item.megaStone;
	},
	pokemon: {
		runImmunity(type: string, message?: string | boolean) {
			if (!type || type === '???') return true;
			if (!(type in this.battle.dex.data.TypeChart)) {
				if (type === 'Fairy' || type === 'Dark' || type === 'Steel') return true;
				throw new Error("Use runStatusImmunity for " + type);
			}
			if (this.fainted) return false;

			const negateResult = this.battle.runEvent('NegateImmunity', this, type);
			let isGrounded;
			if (type === 'Ground') {
				isGrounded = this.isGrounded(!negateResult);
				if (isGrounded === null) {
					if (message) {
						if (this.hasAbility('powerofalchemyweezing')) {
							this.battle.add('-immune', this, '[from] ability: Power of Alchemy (Weezing)');
						} else if (this.hasAbility('powerofalchemymismagius')) {
							this.battle.add('-immune', this, '[from] ability: Power of Alchemy (Mismagius)');
						} else {
							this.battle.add('-immune', this, '[from] ability: Levitate');
						}
					}
					return false;
				}
			}
			if (!negateResult) return true;
			if ((isGrounded === undefined && !this.battle.dex.getImmunity(type, this)) || isGrounded === false) {
				if (message) {
					this.battle.add('-immune', this);
				}
				return false;
			}
			return true;
		},
		isGrounded(negateImmunity = false) {
			if ('gravity' in this.battle.field.pseudoWeather) return true;
			if ('ingrain' in this.volatiles && this.battle.gen >= 4) return true;
			if ('smackdown' in this.volatiles) return true;
			const item = (this.ignoringItem() ? '' : this.item);
			if (item === 'ironball') return true;
			// If a Fire/Flying type uses Burn Up and Roost, it becomes ???/Flying-type, but it's still grounded.
			if (!negateImmunity && this.hasType('Flying') && !('roost' in this.volatiles)) return false;
			if (
				(this.hasAbility('levitate') ||
				this.hasAbility('powerofalchemyweezing') ||
				this.hasAbility('powerofalchemymismagius')) &&
				!this.battle.suppressingAttackEvents()
			) return null;
			if ('magnetrise' in this.volatiles) return false;
			if ('telekinesis' in this.volatiles) return false;
			return item !== 'airballoon';
		},
        ignoringAbility() {
            // Check if any active pokemon have the ability Neutralizing Gas
            let neutralizinggas = false;
            let powerofalchemyweezing = false;
            for (const pokemon of this.battle.getAllActive()) {
                // can't use hasAbility because it would lead to infinite recursion
                if (pokemon.ability === ('neutralizinggas' as ID) || (pokemon.ability === ('powerofalchemyweezing' as ID) && !pokemon.volatiles['gastroacid'] && !pokemon.abilityData.ending)) {
                    neutralizinggas = true;
                    powerofalchemyweezing = true;
                    break;
                }
            }

            return !!(
                (this.battle.gen >= 5 && !this.isActive) ||
                ((this.volatiles['gastroacid'] || (neutralizinggas && this.ability !== ('neutralizinggas' as ID)) || (powerofalchemyweezing && this.ability !== ('powerofalchemyweezing' as ID)) ) &&
                !this.getAbility().isPermanent
                )
            );
        },
		setStatus(
        status: string | Condition,
        source: Pokemon | null = null,
        sourceEffect: Effect | null = null,
        ignoreImmunities = false
    ) {
			  if (!this.hp) return false;
			  status = this.battle.dex.getEffect(status);
			  if (this.battle.event) {
					if (!source) source = this.battle.event.source;
					if (!sourceEffect) sourceEffect = this.battle.effect;
			  }
			  if (!source) source = this;

			  if (this.status === status.id) {
					if ((sourceEffect as Move)?.status === this.status) {
						 this.battle.add('-fail', this, this.status);
					} else if ((sourceEffect as Move)?.status) {
						 this.battle.add('-fail', source);
						 this.battle.attrLastMove('[still]');
					}
					return false;
			  }
			  if (!ignoreImmunities && status.id &&
						 !(source?.hasAbility(['corrosion', 'powerofalchemymismagius']) && ['tox', 'psn'].includes(status.id))) {
					// the game currently never ignores immunities
					if (!this.runStatusImmunity(status.id === 'tox' ? 'psn' : status.id)) {
						 this.battle.debug('immune to status');
						 if ((sourceEffect as Move)?.status) {
							  this.battle.add('-immune', this);
						 }
						 return false;
					}
			  }
			  const prevStatus = this.status;
			  const prevStatusData = this.statusData;
			  if (status.id) {
					const result: boolean = this.battle.runEvent('SetStatus', this, source, sourceEffect, status);
					if (!result) {
						 this.battle.debug('set status [' + status.id + '] interrupted');
						 return result;
					}
			  }
			  this.status = status.id;
			  this.statusData = {id: status.id, target: this};
			  if (source) this.statusData.source = source;
			  if (status.duration) this.statusData.duration = status.duration;
			  if (status.durationCallback) {
					this.statusData.duration = status.durationCallback.call(this.battle, this, source, sourceEffect);
			  }

			  if (status.id && !this.battle.singleEvent('Start', status, this.statusData, this, source, sourceEffect)) {
					this.battle.debug('status start [' + status.id + '] interrupted');
					// cancel the setstatus
					this.status = prevStatus;
					this.statusData = prevStatusData;
					return false;
			  }
			  if (status.id && !this.battle.runEvent('AfterSetStatus', this, source, sourceEffect, status)) {
					return false;
			  }
			  return true;
        }
    },
	getDamage(
		pokemon: Pokemon, target: Pokemon, move: string | number | ActiveMove,
		suppressMessages = false
	): number | undefined | null | false { // modified for Electro Ball
		if (typeof move === 'string') move = this.dex.getActiveMove(move);

		if (typeof move === 'number') {
			const basePower = move;
			move = new Dex.Move({
				basePower,
				type: '???',
				category: 'Physical',
				willCrit: false,
			}) as ActiveMove;
			move.hit = 0;
		}

		if (!move.ignoreImmunity || (move.ignoreImmunity !== true && !move.ignoreImmunity[move.type])) {
			if (!target.runImmunity(move.type, !suppressMessages)) {
				return false;
			}
		}

		if (move.ohko) return target.maxhp;
		if (move.damageCallback) return move.damageCallback.call(this, pokemon, target);
		if (move.damage === 'level') {
			return pokemon.level;
		} else if (move.damage) {
			return move.damage;
		}

		const category = this.getCategory(move);
		const defensiveCategory = move.defensiveCategory || category;

		let basePower: number | false | null = move.basePower;
		if (move.basePowerCallback) {
			basePower = move.basePowerCallback.call(this, pokemon, target, move);
		}
		if (!basePower) return basePower === 0 ? undefined : basePower;
		basePower = this.clampIntRange(basePower, 1);

		let critMult;
		let critRatio = this.runEvent('ModifyCritRatio', pokemon, target, move, move.critRatio || 0);
		if (this.gen <= 5) {
			critRatio = this.clampIntRange(critRatio, 0, 5);
			critMult = [0, 16, 8, 4, 3, 2];
		} else {
			critRatio = this.clampIntRange(critRatio, 0, 4);
			if (this.gen === 6) {
				critMult = [0, 16, 8, 2, 1];
			} else {
				critMult = [0, 24, 8, 2, 1];
			}
		}

		const moveHit = target.getMoveHitData(move);
		moveHit.crit = move.willCrit || false;
		if (move.willCrit === undefined) {
			if (critRatio) {
				moveHit.crit = this.randomChance(1, critMult[critRatio]);
			}
		}

		if (moveHit.crit) {
			moveHit.crit = this.runEvent('CriticalHit', target, null, move);
		}

		// happens after crit calculation
		basePower = this.runEvent('BasePower', pokemon, target, move, basePower, true);

		if (!basePower) return 0;
		basePower = this.clampIntRange(basePower, 1);

		const level = pokemon.level;

		const attacker = pokemon;
		const defender = target;
		let attackStat: StatNameExceptHP = category === 'Physical' ? 'atk' : 'spa';
		const defenseStat: StatNameExceptHP = defensiveCategory === 'Physical' ? 'def' : 'spd';
		const speedStat: StatNameExceptHP = 'spe';
		if (move.useSourceDefensiveAsOffensive) {
			attackStat = defenseStat;
			// Body press really wants to use the def stat,
			// so it switches stats to compensate for Wonder Room.
			// Of course, the game thus miscalculates the boosts...
			if ('wonderroom' in this.field.pseudoWeather) {
				if (attackStat === 'def') {
					attackStat = 'spd';
				} else if (attackStat === 'spd') {
					attackStat = 'def';
				}
				if (attacker.boosts['def'] || attacker.boosts['spd']) {
					this.hint("Body Press uses Sp. Def boosts when Wonder Room is active.");
				}
			}
		}
		if (move.useSourceSpeedAsOffensive) attackStat = speedStat;

		const statTable = {atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe'};
		let attack;
		let defense;

		let atkBoosts = move.useTargetOffensive ? defender.boosts[attackStat] : attacker.boosts[attackStat];
		let defBoosts = defender.boosts[defenseStat];

		let ignoreNegativeOffensive = !!move.ignoreNegativeOffensive;
		let ignorePositiveDefensive = !!move.ignorePositiveDefensive;

		if (moveHit.crit) {
			ignoreNegativeOffensive = true;
			ignorePositiveDefensive = true;
		}
		const ignoreOffensive = !!(move.ignoreOffensive || (ignoreNegativeOffensive && atkBoosts < 0));
		const ignoreDefensive = !!(move.ignoreDefensive || (ignorePositiveDefensive && defBoosts > 0));

		if (ignoreOffensive) {
			this.debug('Negating (sp)atk boost/penalty.');
			atkBoosts = 0;
		}
		if (ignoreDefensive) {
			this.debug('Negating (sp)def boost/penalty.');
			defBoosts = 0;
		}

		if (move.useTargetOffensive) {
			attack = defender.calculateStat(attackStat, atkBoosts);
		} else {
			attack = attacker.calculateStat(attackStat, atkBoosts);
		}

		attackStat = (category === 'Physical' ? 'atk' : 'spa');
		defense = defender.calculateStat(defenseStat, defBoosts);

		// Apply Stat Modifiers
		attack = this.runEvent('Modify' + statTable[attackStat], attacker, defender, move, attack);
		defense = this.runEvent('Modify' + statTable[defenseStat], defender, attacker, move, defense);

		if (this.gen <= 4 && ['explosion', 'selfdestruct'].includes(move.id) && defenseStat === 'def') {
			defense = this.clampIntRange(Math.floor(defense / 2), 1);
		}

		const tr = this.trunc;

		// int(int(int(2 * L / 5 + 2) * A * P / D) / 50);
		const baseDamage = tr(tr(tr(tr(2 * level / 5 + 2) * basePower * attack) / defense) / 50);

		// Calculate damage modifiers separately (order differs between generations)
		return this.modifyDamage(baseDamage, pokemon, target, move, suppressMessages);
	},
/*
	pokemon: {
        hasAbility(ability) {
            if (this.ignoringAbility()) return false;
            ability = toID(ability);
            return this.ability === ability || !!this.volatiles['ability' + ability];
            if(this.ability === 'powerofalchemy'){
                return this.species.abilities.some(checkAbility => toID(checkAbility) === ability || !!this.volatiles['ability' + toID(checkAbility)]);
            }
        },
		transformInto(pokemon, effect) {
			let template = pokemon.template;
			if (pokemon.fainted || pokemon.illusion || (pokemon.volatiles['substitute'] && this.battle.gen >= 5)) {
				return false;
			}
			if (!template.abilities || (pokemon && pokemon.transformed && this.battle.gen >= 2) || (this.transformed && this.battle.gen >= 5)) {
				return false;
			}
			if (!this.formeChange(template, null)) {
				return false;
			}
			this.transformed = true;

			this.types = pokemon.types;
			this.addedType = pokemon.addedType;
			this.knownType = this.side === pokemon.side && pokemon.knownType;

			for (let statName in this.stats) {
				this.stats[statName] = pokemon.stats[statName];
			}
			this.moveSlots = [];
			this.set.ivs = (this.battle.gen >= 5 ? this.set.ivs : pokemon.set.ivs);
			this.hpType = (this.battle.gen >= 5 ? this.hpType : pokemon.hpType);
			this.hpPower = (this.battle.gen >= 5 ? this.hpPower : pokemon.hpPower);
			for (let i = 0; i < pokemon.moveSlots.length; i++) {
				let moveData = pokemon.moveSlots[i];
				let moveName = moveData.move;
				if (moveData.id === 'hiddenpower') {
					moveName = 'Hidden Power ' + this.hpType;
				}
				this.moveSlots.push({
					move: moveName,
					id: moveData.id,
					pp: moveData.maxpp === 1 ? 1 : 5,
					maxpp: this.battle.gen >= 5 ? (moveData.maxpp === 1 ? 1 : 5) : moveData.maxpp,
					target: moveData.target,
					disabled: false,
					used: false,
					virtual: true,
				});
			}
			for (let j in pokemon.boosts) {
				// @ts-ignore
				this.boosts[j] = pokemon.boosts[j];
			}
			if (effect) {
				this.battle.add('-transform', this, pokemon, '[from] ' + effect.fullname);
			} else {
				this.battle.add('-transform', this, pokemon);
			}
			this.setAbility(pokemon.ability, this, true);
			if (this.innates) {
				for (let innate of this.innates) {
					this.removeVolatile('ability' + innate);
				}
			}
			if (pokemon.innates) {
				for (let innate of pokemon.innates) {
					this.addVolatile('ability' + innate, this);
				}
			}
			return true;
		},
	},
*/
	
	init: function () {
/*
		for (const id in this.dataCache.Pokedex) {
			const poke = this.dataCache.Pokedex[id];
			if (poke.restrictedLearnset) {
				console.log(this.toID(poke.name));
				const thisPoke = this.toID(poke.name);
				const learnset = this.dataCache.Learnsets[this.toID(poke.name)].learnset;
				for (const move in learnset) {
					console.log(thisPoke + " has " + move);
					const moveid = this.dataCache.Moves[move];
					if (moveid.isNonstandard) {
						console.log(moveid.isNonstandard);
						delete this.modData('Learnsets', thisPoke).learnset.moveid;
					}
				}
			}
		}
*/

this.modData('Learnsets', 'wigglytuff').learnset.geomancy = ['8L1'];
this.modData('Learnsets', 'articunogalar').learnset.defog = ['8L1'];
this.modData('Learnsets', 'zapdosgalar').learnset.defog = ['8L1'];
this.modData('Learnsets', 'moltresgalar').learnset.defog = ['8L1'];
this.modData('Learnsets', 'articunogalar').learnset.toxic = ['8L1'];
this.modData('Learnsets', 'zapdosgalar').learnset.toxic = ['8L1'];
this.modData('Learnsets', 'moltresgalar').learnset.toxic = ['8L1'];
this.modData('Learnsets', 'magmortar').learnset.recover = ['8L1'];
this.modData('Learnsets', 'girafarig').learnset.focusblast = ['8L1'];
this.modData('Learnsets', 'zarude').learnset.focusblast = ['8L1'];
this.modData('Learnsets', 'samurott').learnset.focusblast = ['8L1'];
this.modData('Learnsets', 'jirachi').learnset.focusblast = ['8L1'];
this.modData('Learnsets', 'delphox').learnset.focusblast = ['8L1'];
this.modData('Learnsets', 'ninetalesalola').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'sandslashalola').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'abomasnow').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'arctozolt').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'arctovish').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'avalugg').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'articuno').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'crabominable').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'cryogonal').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'dewgong').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'froslass').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'frosmoth').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'glaceon').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'glalie').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'glastrier').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'jynx').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'lapras').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'mrrime').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'vanilluxe').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'walrein').learnset.meltdown = ['8L1'];
this.modData('Learnsets', 'spinarak').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'weedle').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'wurmple').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'venonat').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'combee').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'volbeat').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'illumise').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'shuckle').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'surskit').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'bulbasaur').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'joltik').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'dewpider').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'slowbrogalar').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'tentacool').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'poipole').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'umbreon').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'tangrowth').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'accelgor').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'leavanny').learnset.toxicthread = ['8L1'];
this.modData('Learnsets', 'anorith').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'croagunk').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'cubone').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'diglett').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'diglettalola').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'drilbur').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'geodude').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'geodudealola').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'gible').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'gligar').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'groudon').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'helioptile').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'jynx').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'mudbray').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'numel').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'lileep').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'onix').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'paras').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'rhyhorn').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'rolycoly').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'salandit').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'sandile').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'sandshrew').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'shuckle').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'silicobra').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'torkoal').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'trapinch').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'volcanion').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'wormadamsandy').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'yamaskgalar').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'solrock').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'lunatone').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'minior').learnset.aridabsorption = ['8L1'];
this.modData('Learnsets', 'aegislash').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'aggron').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'arceus').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'bastiodon').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'bronzong').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'carbink').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'celesteela').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'copperajah').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'dialga').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'duraludon').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'empoleon').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'escavalier').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'forretress').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'genesect').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'jirachi').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'kartana').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'klinklang').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'magearna').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'magnezone').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'melmetal').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'necrozma').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'probopass').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'regice').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'regigigas').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'registeel').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'regirock').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'scizor').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'skarmory').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'solgaleo').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'stakataka').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'steelix').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'wormadamtrash').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'wormadam').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'wormadamsandy').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'zamazenta').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'reuniclus').learnset.reconstruct = ['8L1'];
this.modData('Learnsets', 'porygon').learnset.reconstruct = ['8L1'];
delete this.modData('Learnsets', 'alakazam').learnset.nastyplot;
this.modData('Learnsets', 'meganium').learnset.wish = ['8L1'];
this.modData('Learnsets', 'meganium').learnset.weatherball = ['8L1'];
this.modData('Learnsets', 'meganium').learnset.bodypress = ['8L1'];
this.modData('Learnsets', 'ampharos').learnset.dracometeor = ['8L1'];
this.modData('Learnsets', 'ampharos').learnset.slackoff = ['8L1'];
this.modData('Learnsets', 'ambipom').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'breloom').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'grapploct').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'sawk').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'infernape').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'scrafty').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'hitmonchan').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'crabominable').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'machamp').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'conkeldurr').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'melmetal').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'pangoro').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'ledian').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'toxicroak').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'mukalola').learnset.armthrust = ['8L1'];
this.modData('Learnsets', 'trevenant').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'exeggcute').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'landorus').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'thundurus').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'tornadus').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'ferrothorn').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'calyrex').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'dhelmise').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'leafeon').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'meganium').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'torterra').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'dubwool').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'sawsbuck').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'comfey').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'maractus').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'abomasnow').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'scolipede').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'regigigas').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'simisage').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'simisear').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'simipour').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'sirfetchd').learnset.rototiller = ['8L1'];
this.modData('Learnsets', 'chansey').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'umbreon').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'milotic').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'amoonguss').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'mismagius').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'braixen').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'murkrow').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'ninetales').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'lumineon').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'volbeat').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'solrock').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'pachirisu').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'gigalith').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'watchog').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'gourgeist').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'zekrom').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'electivire').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'golemalola').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'luxray').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'thundurus').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'eelektross').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'zeraora').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'pincurchin').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'arctozolt').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'dracozolt').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'regieleki').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'zebstrika').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'togedemaru').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'toxtricity').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'toxtricitylowkey').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'morpeko').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'zapdos').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'raichualola').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'raichu').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'raikou').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'xurkitree').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'marowak').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'marowakalola').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'rhydon').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'goldeen').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'manectric').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'terrakion').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'virizion').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'keldeo').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'cobalion').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'sirfetchd').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'gallade').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'escavalier').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'celesteela').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'zacian').learnset.lightninglance = ['8L1'];
this.modData('Learnsets', 'cleffa').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'ralts').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'mawile').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'tapukoko').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'tapulele').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'tapubulu').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'tapufini').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'azurill').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'diancie').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'flabebe').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'snubbull').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'impidimp').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'hatenna').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'ninetalesalola').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'primarina').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'klefki').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'mimikyu').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'togepi').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'weezinggalar').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'swirlix').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'comfey').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'carbink').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'sylveon').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'spritzee').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'cutiefly').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'cottonee').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'milcery').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'dedenne').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'mimejr').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'ponytagalar').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'morelull').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'igglybuff').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'xerneas').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'magearna').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'zacian').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'hoopa').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'latias').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'latios').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'meditite').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'slowpoke').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'slowpokegalar').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'abra').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'victini').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'articunogalar').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'azelf').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'bruxish').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'chingling').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'delphox').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'deoxys').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'girafarig').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'spoink').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'drowzee').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'jirachi').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'meloetta').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'mew').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'beldum').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'necrozma').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'solosis').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'cresselia').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'indeedee').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'indeedeef').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'sigilyph').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'bronzor').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'celebi').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'espeon').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'starmie').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'raichualola').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'calyrex').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'baltoy').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'mesprit').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'natu').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'elgyem').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'exeggcute').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'gothita').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'smoochum').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'lunatone').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'inkay').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'espurr').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'munna').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'oranguru').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'dottler').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'woobat').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'uxie').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'mewtwo').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'lugia').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'arceus').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'solgaleo').learnset.counterspell = ['8L1'];
this.modData('Learnsets', 'lunala').learnset.counterspell = ['8L1'];
this.modData("Learnsets", "oshawott").learnset.firstimpression = ["8L1"];
this.modData("Learnsets", "dewott").learnset.brickbreak = ["8L1"];
this.modData("Learnsets", "dewott").learnset.closecombat = ["8L1"];
this.modData("Learnsets", "samurott").learnset.shellsmash = ["8L1"];
this.modData("Learnsets", "samurott").learnset.drillrun = ["8L1"];
this.modData("Learnsets", "muk").learnset.recover = ["8L1"];
this.modData("Learnsets", "mukalola").learnset.recover = ["8L1"];
this.modData("Learnsets", "mukalola").learnset.toxicspikes = ["8L1"];
delete this.modData('Learnsets', 'grimeralola').learnset.knockoff;
delete this.modData('Learnsets', 'mukalola').learnset.knockoff;
this.modData("Learnsets", "mismagius").learnset.moonblast = ["8L1"];
this.modData("Learnsets", "mismagius").learnset.partingshot = ["8L1"];
this.modData("Learnsets", "mismagius").learnset.toxicspikes = ["8L1"];
this.modData("Learnsets", "mismagius").learnset.venoshock = ["8L1"];
this.modData('Learnsets', 'mismagius').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'primarina').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'froslass').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'chatot').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'cursola').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'exploud').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'gourgeist').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'drifblim').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'guzzlord').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'banette').learnset.deafeningshriek = ['8L1'];
this.modData('Learnsets', 'ludicolo').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'politoed').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'alomomola').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'luvdisc').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'florges').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'xerneas').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'empoleon').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'phione').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'indeedee').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'indeedeef').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'comfey').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'eldegoss').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'seel').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'meganium').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'wailmer').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'panpour').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'misdreavus').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'hoopa').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'morelull').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'munna').learnset.lifedew = ['8L1'];
this.modData('Learnsets', 'litten').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'zigzagoongalar').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'silvally').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'pancham').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'chatot').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'morpeko').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'persianalola').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'thievul').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'trubbish').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'articunogalar').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'toxtricity').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'muk').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'toxtricitylowkey').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'muk').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'mukalola').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'weezing').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'crobat').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'toxicroak').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'scrafty').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'simisage').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'salandit').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'yveltal').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'sneasel').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'hoopa').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'zweilous').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'krookodile').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'cacturne').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'houndoom').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'zoroark').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'slowkinggalar').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'gastly').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'liepard').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'malamar').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'vullaby').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'zarude').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'seviper').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'zangoose').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'gulpin').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'skuntank').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'rattataalola').learnset.trashtalk = ['8L1'];
this.modData('Learnsets', 'bruxish').learnset.trashtalk = ['8L1'];
this.modData("Learnsets", "meganium").learnset.playrough = ["8L1"];
this.modData("Learnsets", "meganium").learnset.moonblast = ["8L1"];
this.modData("Learnsets", "meganium").learnset.drainingkiss = ["8L1"];
this.modData("Learnsets", "meganium").learnset.superpower = ["8L1"];
this.modData("Learnsets", "meganium").learnset.dazzlinggleam = ["8L1"];
this.modData("Learnsets", "typhlosion").learnset.earthpower = ["8L1"];
this.modData("Learnsets", "typhlosion").learnset.meteorbeam = ["8L1"];
this.modData("Learnsets", "typhlosion").learnset.scorchingsands = ["8L1"];
this.modData("Learnsets", "typhlosion").learnset.stealthrock = ["8L1"];
this.modData("Learnsets", "feraligatr").learnset.suckerpunch = ["8L1"];
this.modData("Learnsets", "feraligatr").learnset.pursuit = ["8L1"];
this.modData("Learnsets", "feraligatr").learnset.scaleshot = ["8L1"];
this.modData("Learnsets", "centiskorch").learnset.scaleshot = ["8L1"];
this.modData("Learnsets", "centiskorch").learnset.recover = ["8L1"];
this.modData("Learnsets", "centiskorch").learnset.suckerpunch = ["8L1"];
this.modData("Learnsets", "centiskorch").learnset.firstimpression = ["8L1"];
this.modData("Learnsets", "centiskorch").learnset.uturn = ["8L1"];
this.modData("Learnsets", "centiskorch").learnset.earthquake = ["8L1"];
this.modData("Learnsets", "centiskorch").learnset.toxic = ["8L1"];
this.modData("Learnsets", "centiskorch").learnset.rapidspin = ["8L1"];
this.modData("Learnsets", "houndoom").learnset.fierywrath = ["8L1"];
this.modData("Learnsets", "blacephalon").learnset.pyroball = ["8L1"];
this.modData("Learnsets", "blacephalon").learnset.headbutt = ["8L1"];
this.modData("Learnsets", "blacephalon").learnset.poltergeist = ["8L1"];
this.modData("Learnsets", "blacephalon").learnset.headcharge = ["8L1"];
this.modData('Learnsets', 'tapukoko').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'tapulele').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'tapufini').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'tapubulu').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'clefairy').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'wigglytuff').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'hatterene').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'grimmsnarl').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'mrmime').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'golett').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'ledian').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'hitmonchan').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'trevenant').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'haunter').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'shroomish').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'infernape').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'meditite').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'slurpuff').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'shiinotic').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'aromatisse').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'regigigas').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'ralts').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'whimsicott').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'mawile').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'azumarill').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'granbull').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'dusclops').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'jirachi').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'reuniclus').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'audino').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'marshadow').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'hoopa').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'meloetta').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'sableye').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'mesprit').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'uxie').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'azelf').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'delphox').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'celebi').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'victini').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'mew').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'mewtwo').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'abra').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'diancie').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'wooper').learnset.enchantedpunch = ['8L1'];
this.modData('Learnsets', 'golemalola').learnset.electroball = ['8L1'];
this.modData('Learnsets', 'passimian').learnset.electroball = ['8L1'];
this.modData('Learnsets', 'klinklang').learnset.electroball = ['8L1'];
this.modData('Learnsets', 'jumpluff').learnset.electroball = ['8L1'];
this.modData('Learnsets', 'raikou').learnset.electroball = ['8L1'];
this.modData('Learnsets', 'eelektrik').learnset.electroball = ['8L1'];
this.modData('Learnsets', 'blacephalon').learnset.electroball = ['8L1'];
this.modData('Learnsets', 'zebstrika').learnset.electroball = ['8L1'];
this.modData('Learnsets', 'diggersby').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'dusknoir').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'grapploct').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'passimian').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'machamp').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'sawk').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'throh').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'lurantis').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'metagross').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'pignite').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'aipom').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'golurk').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'ledian').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'regigigas').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'poliwhirl').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'primeape').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'hawlucha').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'toxicroak').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'eelektross').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'mienshao').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'thundurus').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'tornadus').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'medicham').learnset.skyuppercut = ['8L1'];
this.modData('Learnsets', 'hariyama').learnset.skyuppercut = ['8L1'];
delete this.modData('Learnsets', 'lopunny').learnset.skyuppercut;
delete this.modData('Learnsets', 'buneary').learnset.skyuppercut;
delete this.modData('Learnsets', 'tapukoko').learnset.electroball;
delete this.modData('Learnsets', 'regieleki').learnset.electroball;
this.modData('Learnsets', 'slurpuff').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'greedent').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'komala').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'indeedee').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'indeedeef').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'passimian').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'darmanitan').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'beartic').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'mienfoo').learnset.thunderpunch = ['8L1'];
this.modData('Learnsets', 'slurpuff').learnset.firepunch = ['8L1'];
this.modData('Learnsets', 'greedent').learnset.firepunch = ['8L1'];
this.modData('Learnsets', 'komala').learnset.firepunch = ['8L1'];
this.modData('Learnsets', 'indeedee').learnset.firepunch = ['8L1'];
this.modData('Learnsets', 'indeedeef').learnset.firepunch = ['8L1'];
this.modData('Learnsets', 'passimian').learnset.firepunch = ['8L1'];
this.modData('Learnsets', 'cherrim').learnset.firepunch = ['8L1'];
this.modData('Learnsets', 'mienfoo').learnset.firepunch = ['8L1'];
this.modData('Learnsets', 'slurpuff').learnset.icepunch = ['8L1'];
this.modData('Learnsets', 'greedent').learnset.icepunch = ['8L1'];
this.modData('Learnsets', 'komala').learnset.icepunch = ['8L1'];
this.modData('Learnsets', 'indeedee').learnset.icepunch = ['8L1'];
this.modData('Learnsets', 'indeedeef').learnset.icepunch = ['8L1'];
this.modData('Learnsets', 'passimian').learnset.icepunch = ['8L1'];
this.modData('Learnsets', 'barbaracle').learnset.icepunch = ['8L1'];
this.modData('Learnsets', 'mienfoo').learnset.icepunch = ['8L1'];
this.modData("Learnsets", "wishiwashi").learnset.recover = ["8L1"];
this.modData("Learnsets", "wishiwashi").learnset.outrage = ["8L1"];
this.modData("Learnsets", "wishiwashi").learnset.dragondance = ["8L1"];
this.modData("Learnsets", "wishiwashi").learnset.dragonpulse = ["8L1"];
this.modData("Learnsets", "wishiwashi").learnset.dracometeor = ["8L1"];
this.modData("Learnsets", "wishiwashi").learnset.coreenforcer = ["8L1"];
this.modData("Learnsets", "azelf").learnset.aurasphere = ["8L1"];
this.modData("Learnsets", "azelf").learnset.focusblast = ["8L1"];
this.modData("Learnsets", "azelf").learnset.reversal = ["8L1"];
this.modData("Learnsets", "azelf").learnset.vacuumwave = ["8L1"];
this.modData("Learnsets", "azelf").learnset.forcepalm = ["8L1"];
this.modData("Learnsets", "mesprit").learnset.taunt = ["8L1"];
this.modData("Learnsets", "mesprit").learnset.moonblast = ["8L1"];
this.modData("Learnsets", "mesprit").learnset.spiritbreak = ["8L1"];
this.modData("Learnsets", "mesprit").learnset.fairylock = ["8L1"];
this.modData("Learnsets", "mesprit").learnset.defog = ["8L1"];
this.modData("Learnsets", "uxie").learnset.flashcannon = ["8L1"];
this.modData("Learnsets", "uxie").learnset.recover = ["8L1"];
this.modData("Learnsets", "uxie").learnset.disable = ["8L1"];
this.modData("Learnsets", "uxie").learnset.doomdesire = ["8L1"];
this.modData("Learnsets", "uxie").learnset.teleport = ["8L1"];
delete this.modData('Learnsets', 'melmetal').learnset.thunderpunch;
this.modData('Learnsets', 'fearow').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'graveler').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'graveleralola').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'voltorb').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'rhydon').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'totodile').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'hoppip').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'miltank').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'dunsparce').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'kirlia').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'spheal').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'bidoof').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'burmy').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'floatzel').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'lickilicky').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'whirlipede').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'sandile').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'minccino').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'klink').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'meloetta').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'incineroar').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'poipole').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'wooloo').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'barraskewda').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'alcremie').learnset.rapidspin = ['8L1'];
this.modData('Learnsets', 'meowth').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'meowthalola').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'meowthgalar').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'krabby').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'zapdosgalar').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'totodile').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'scizor').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'ursaring').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'gligar').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'corphish').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'absol').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'metang').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'drapion').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'dwebble').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'krokorok').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'beartic').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'binacle').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'clawitzer').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'pangoro').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'trevenant').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'yveltal').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'incineroar').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'crabrawler').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'golisopod').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'bewear').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'guzzlord').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'necrozma').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'zeraora').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'hatterene').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'zarude').learnset.crushclaw = ['8L1'];
this.modData('Learnsets', 'poliwag').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'seel').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'qwilfish').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'lotad').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'huntail').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'gorebyss').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'luvdisc').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'anorith').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'piplup').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'bidoof').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'buizel').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'finneon').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'croagunk').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'phione').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'oshawott').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'panpour').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'alomomola').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'ducklett').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'stunfisk').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'eelektrik').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'inkay').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'bruxish').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'golisopod').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'grapploct').learnset.flipturn = ['8L1'];
this.modData('Learnsets', 'meganium').learnset.highhorsepower = ['8L1'];
	},
};
