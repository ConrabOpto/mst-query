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

export const moreListData = {
    items: [
        {
            id: 'test5',
            description: 'Test item5',
            created: new Date('2020-01-01'),
            count: 1,
            createdBy: {
                id: 'ko',
                name: 'Kim',
                age: 35,
            },
        },
        {
            id: 'test6',
            description: 'Test item6',
            created: new Date('2020-01-01'),
            count: 2,
            createdBy: {
                id: 'aa',
                name: 'Alice',
                age: 43,
            },
        },
        {
            id: 'test7',
            description: 'Test item7',
            created: new Date('2020-01-01'),
            count: 4,
            createdBy: {
                id: 'bb',
                name: 'Bob',
                age: 23,
            },
        },
        {
            id: 'test8',
            description: 'Test item8',
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
