export const dataModel = {
    name: 'test',
};

export const itemData = {
    id: 'test',
    description: 'Test item',
    created: new Date('2020-01-01'),
    count: 4,
    createdBy: {
        id: 'ko',
        name: 'Kim',
        age: 35,
    },
    data: dataModel,
};

export const listData = {
    items: [
        {
            id: 'test',
            description: 'Test item',
            created: new Date('2020-01-01'),
            count: 4,
            createdBy: {
                id: 'ko',
                name: 'Kim',
                age: 35,
            },
        },
        {
            id: 'test2',
            description: 'Test item2',
            created: new Date('2020-01-01'),
            count: 6,
            createdBy: {
                id: 'aa',
                name: 'Alice',
                age: 43,
            },
        },
        {
            id: 'test3',
            description: 'Test item3',
            created: new Date('2020-01-01'),
            count: 2,
            createdBy: {
                id: 'bb',
                name: 'Bob',
                age: 23,
            },
        },
        {
            id: 'test4',
            description: 'Test item4',
            created: new Date('2020-01-01'),
            count: 3,
            createdBy: {
                id: 'cc',
                name: 'Calle',
                age: 29,
            },
        },
    ],
};
