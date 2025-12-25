/**
 * Table Tennis Specific Configuration
 * 
 * Game-specific settings that are only relevant to table tennis.
 * Other games would have their own configuration files.
 */
const TableTennisConfig = {
    ASSETS: {
        BALL: 'ball',
        BAT_A: 'bat_a',
        BAT_B: 'bat_b',
        TABLE: 'table',
        BAT_HIT: 'bat_hit',
        TABLE_BOUNCE: 'table_bounce',
    },

    TITLE: 'Table Tennis Web',

    SCENES: {
        BOOT: 'BootScene',
        MENU: 'MenuScene',
        GAME: 'GameScene',
    }
};

export default TableTennisConfig;
